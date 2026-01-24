import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { speechToText, openai, convertWebmToWav } from "./replit_integrations/audio/client";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

// ============================================================
// UPLOAD CONFIGURATION
// Increased limit to 100MB to handle long lectures
// Files larger than this will show a friendly error
// ============================================================
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  }
});

// ============================================================
// AUDIO CHUNKING HELPERS
// These functions split long audio files into smaller pieces
// for reliable transcription of lengthy lectures
// ============================================================

/**
 * Splits a large audio file into smaller chunks using FFmpeg.
 * Each chunk is approximately 2-3 minutes (180 seconds) long.
 * This prevents transcription API timeouts and memory issues.
 * 
 * @param audioBuffer - The original audio file buffer
 * @param format - The audio format (wav, mp3, webm)
 * @returns Array of audio chunk buffers
 */
async function splitAudioIntoChunks(
  audioBuffer: Buffer, 
  format: string
): Promise<Buffer[]> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-chunks-"));
  const inputPath = path.join(tempDir, `input.${format}`);
  const outputPattern = path.join(tempDir, "chunk_%03d.wav");
  
  try {
    // Write input file to temp directory
    fs.writeFileSync(inputPath, audioBuffer);
    
    // Get audio duration using ffprobe
    const { stdout: durationOutput } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`
    );
    const duration = parseFloat(durationOutput.trim());
    console.log(`  Audio duration: ${duration.toFixed(1)} seconds`);
    
    // If audio is short (under 3 minutes), no need to split
    const CHUNK_DURATION = 180; // 3 minutes per chunk
    if (duration <= CHUNK_DURATION) {
      console.log("  Audio is short enough, no splitting needed");
      // Convert to WAV for consistent processing
      const wavPath = path.join(tempDir, "single.wav");
      await execAsync(
        `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -f wav "${wavPath}" -y`
      );
      const wavBuffer = fs.readFileSync(wavPath);
      return [wavBuffer];
    }
    
    // Split into chunks using FFmpeg segment muxer
    // -f segment: use segment muxer to split file
    // -segment_time: duration of each chunk in seconds
    // -ar 16000: resample to 16kHz (optimal for speech recognition)
    // -ac 1: convert to mono
    console.log(`  Splitting into ~${Math.ceil(duration / CHUNK_DURATION)} chunks...`);
    
    await execAsync(
      `ffmpeg -i "${inputPath}" -f segment -segment_time ${CHUNK_DURATION} -ar 16000 -ac 1 "${outputPattern}" -y`
    );
    
    // Read all generated chunk files
    const chunks: Buffer[] = [];
    const files = fs.readdirSync(tempDir)
      .filter(f => f.startsWith("chunk_"))
      .sort();
    
    for (const file of files) {
      const chunkPath = path.join(tempDir, file);
      chunks.push(fs.readFileSync(chunkPath));
    }
    
    console.log(`  Created ${chunks.length} audio chunks`);
    return chunks;
    
  } finally {
    // Cleanup temp files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.warn("Failed to cleanup temp dir:", e);
    }
  }
}

/**
 * Transcribes multiple audio chunks and merges the results.
 * Each chunk is transcribed separately to avoid API limits.
 * 
 * @param chunks - Array of audio chunk buffers
 * @returns Combined transcription text
 */
async function transcribeChunks(chunks: Buffer[]): Promise<string> {
  const transcriptions: string[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  Transcribing chunk ${i + 1}/${chunks.length}...`);
    
    try {
      const text = await speechToText(chunks[i], "wav");
      transcriptions.push(text);
    } catch (err: any) {
      console.error(`  Chunk ${i + 1} transcription failed:`, err.message);
      // Continue with other chunks, don't fail completely
      transcriptions.push(`[Transcription failed for segment ${i + 1}]`);
    }
  }
  
  // Join all transcriptions with proper spacing
  return transcriptions.join(" ");
}

// ============================================================
// TEXT CHUNKING HELPER FUNCTIONS
// These functions split long transcripts into smaller pieces
// for better AI processing of lengthy lectures
// ============================================================

/**
 * Splits text into chunks of approximately targetWords size.
 * Tries to split on sentence boundaries to preserve context.
 */
function splitIntoChunks(text: string, targetWords: number = 600): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const sentenceWordCount = sentence.split(/\s+/).length;
    
    if (currentWordCount + sentenceWordCount > targetWords && currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));
      currentChunk = [];
      currentWordCount = 0;
    }
    
    currentChunk.push(sentence);
    currentWordCount += sentenceWordCount;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks;
}

/**
 * Generates a mini-summary for a single chunk of text.
 */
async function summarizeChunk(chunk: string, chunkIndex: number): Promise<string> {
  console.log(`  Summarizing text chunk ${chunkIndex + 1}...`);
  
  const prompt = `
    Summarize the following lecture segment in 100-150 words.
    Focus on key concepts, definitions, and important points.
    
    SEGMENT:
    "${chunk}"
    
    Provide a concise summary:
  `;

  const completion = await openai.chat.completions.create({
    model: "gpt-5.1",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 300,
  });

  return completion.choices[0].message.content || "";
}

/**
 * Processes long transcripts by chunking and summarizing each piece.
 */
async function processLongTranscript(transcription: string): Promise<{
  summary: string;
  structuredNotes: { heading: string; points: string[] }[];
  qaPairs: { question: string; answer: string; marks: 2 | 4 }[];
}> {
  const wordCount = transcription.split(/\s+/).length;
  const CHUNK_THRESHOLD = 1000;
  
  if (wordCount <= CHUNK_THRESHOLD) {
    console.log(`Short transcript (${wordCount} words), processing directly...`);
    return await generateFinalContent(transcription);
  }

  console.log(`Long transcript (${wordCount} words), applying text chunking...`);
  
  const chunks = splitIntoChunks(transcription, 600);
  console.log(`Split into ${chunks.length} text chunks`);

  const miniSummaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const summary = await summarizeChunk(chunks[i], i);
    miniSummaries.push(summary);
  }

  const consolidatedText = miniSummaries.join("\n\n");
  console.log(`Consolidated ${miniSummaries.length} mini-summaries`);

  return await generateFinalContent(consolidatedText);
}

/**
 * Generates the final structured content (summary, notes, Q&A).
 */
async function generateFinalContent(content: string): Promise<{
  summary: string;
  structuredNotes: { heading: string; points: string[] }[];
  qaPairs: { question: string; answer: string; marks: 2 | 4 }[];
}> {
  const prompt = `
    You are an expert academic tutor. Process the following lecture content:
    
    CONTENT:
    "${content}"
    
    Generate the following in strict JSON format:
    1. "summary": A 150-200 word summary of the chapter/lecture.
    2. "structuredNotes": An array of objects, each with a "heading" and "points" (array of strings). Covers the main topics.
    3. "qaPairs": An array of exam-oriented questions and answers. 
       - Include a mix of 2-mark questions (definitions, max 40 words) and 4-mark questions (4 bullet points).
       - "marks" field must be strictly 2 or 4.
       - Include at least 3 questions of each type.
    
    Ensure the JSON matches this schema exactly:
    {
      "summary": string,
      "structuredNotes": [{ "heading": string, "points": string[] }],
      "qaPairs": [{ "question": string, "answer": string, "marks": number }]
    }
  `;

  const completion = await openai.chat.completions.create({
    model: "gpt-5.1",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(completion.choices[0].message.content || "{}");
  
  return {
    summary: parsed.summary || "No summary generated",
    structuredNotes: parsed.structuredNotes || [],
    qaPairs: parsed.qaPairs || [],
  };
}

// ============================================================
// MOCK RESPONSES
// Used when AI API is unavailable
// ============================================================

function getMockResponse(transcription: string) {
  return {
    summary: "This is a mock summary. The AI service is currently unavailable. Your lecture has been transcribed but could not be processed for notes. Please try again later.",
    structuredNotes: [
      {
        heading: "Transcription Available",
        points: [
          "Your audio was successfully transcribed",
          "AI processing is temporarily unavailable",
          "Retry later for full analysis"
        ]
      }
    ],
    qaPairs: [
      {
        question: "What is this lecture about?",
        answer: "Please review the transcription above for lecture content.",
        marks: 2 as const
      }
    ]
  };
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  
  // ============================================================
  // MAIN PROCESSING ENDPOINT
  // Handles file upload, audio chunking, transcription, and AI processing
  // ============================================================
  app.post(api.process.path, upload.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file provided" });
      }

      const fileSizeMB = req.file.size / (1024 * 1024);
      console.log(`Processing file: ${req.file.originalname || "recording"}, Size: ${fileSizeMB.toFixed(2)} MB`);

      // ============================================================
      // FILE SIZE VALIDATION
      // Provide friendly error for files that are too large
      // ============================================================
      if (req.file.size > MAX_FILE_SIZE) {
        return res.status(413).json({ 
          message: `File too large (${fileSizeMB.toFixed(1)} MB). Maximum allowed is ${MAX_FILE_SIZE / (1024 * 1024)} MB. Please try a shorter recording or compress the audio file.`
        });
      }

      // ============================================================
      // STEP 1: DETERMINE AUDIO FORMAT
      // ============================================================
      let format = "webm";
      const mimeType = req.file.mimetype.toLowerCase();
      const filename = (req.file.originalname || "").toLowerCase();
      
      if (mimeType.includes("wav") || filename.endsWith(".wav")) {
        format = "wav";
      } else if (mimeType.includes("mp3") || mimeType.includes("mpeg") || filename.endsWith(".mp3")) {
        format = "mp3";
      } else if (mimeType.includes("m4a") || filename.endsWith(".m4a")) {
        format = "m4a";
      } else if (mimeType.includes("webm") || filename.endsWith(".webm")) {
        format = "webm";
      }
      
      console.log(`Audio format detected: ${format}`);

      // ============================================================
      // STEP 2: AUDIO CHUNKING & TRANSCRIPTION
      // For long audio files, split into 3-minute chunks and
      // transcribe each separately, then merge results
      // ============================================================
      let transcription: string;
      
      try {
        console.log("Splitting audio into chunks for transcription...");
        const audioChunks = await splitAudioIntoChunks(req.file.buffer, format);
        
        console.log("Transcribing audio chunks...");
        transcription = await transcribeChunks(audioChunks);
        
        if (!transcription || transcription.trim().length === 0) {
          return res.status(400).json({ 
            message: "Could not transcribe audio. Please ensure the recording contains clear speech." 
          });
        }
        
      } catch (transcribeErr: any) {
        console.error("Transcription failed:", transcribeErr);
        return res.status(500).json({ 
          message: "Failed to transcribe audio. Please ensure the file is a valid audio recording." 
        });
      }
      
      console.log(`Transcription complete: ${transcription.length} chars, ~${transcription.split(/\s+/).length} words`);

      // ============================================================
      // STEP 3: AI PROCESSING WITH TEXT CHUNKING
      // Process transcript (uses text chunking for long transcripts)
      // ============================================================
      let content;
      try {
        content = await processLongTranscript(transcription);
        console.log("AI processing complete");
      } catch (aiErr: any) {
        console.error("AI processing failed:", aiErr);
        content = getMockResponse(transcription);
      }

      // Store in memory for potential history feature
      await storage.createNote({
        fileName: req.file.originalname || "recording.webm",
        transcription,
        summary: content.summary,
        structuredNotes: content.structuredNotes,
        qaPairs: content.qaPairs,
      });

      res.json({
        transcription,
        summary: content.summary,
        structuredNotes: content.structuredNotes,
        qaPairs: content.qaPairs,
      });

    } catch (error: any) {
      console.error("Processing error:", error);
      
      // Handle multer file size errors
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ 
          message: `File too large. Maximum allowed is ${MAX_FILE_SIZE / (1024 * 1024)} MB. Please try a shorter recording.`
        });
      }
      
      res.status(500).json({ message: error.message || "Failed to process audio" });
    }
  });

  // Error handling middleware for multer
  app.use((err: any, req: any, res: any, next: any) => {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ 
        message: `File too large. Maximum allowed is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`
      });
    }
    next(err);
  });

  return httpServer;
}

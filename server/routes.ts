import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { speechToText, openai, convertWebmToWav } from "./replit_integrations/audio/client";

// Configure upload - supports both file upload and recorded audio
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // Increased to 50MB for longer recordings
  }
});

// ============================================================
// CHUNKING HELPER FUNCTIONS
// These functions split long transcripts into smaller pieces
// for better AI processing of lengthy lectures
// ============================================================

/**
 * Splits text into chunks of approximately targetWords size.
 * Tries to split on sentence boundaries to preserve context.
 * 
 * @param text - The full transcript text
 * @param targetWords - Target words per chunk (default 600, range 500-800)
 * @returns Array of text chunks
 */
function splitIntoChunks(text: string, targetWords: number = 600): string[] {
  // Split text into sentences (handles common sentence endings)
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const sentenceWordCount = sentence.split(/\s+/).length;
    
    // If adding this sentence exceeds target and we have content, start new chunk
    if (currentWordCount + sentenceWordCount > targetWords && currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));
      currentChunk = [];
      currentWordCount = 0;
    }
    
    currentChunk.push(sentence);
    currentWordCount += sentenceWordCount;
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks;
}

/**
 * Generates a mini-summary for a single chunk of text.
 * Used when processing long lectures in pieces.
 * 
 * @param chunk - A portion of the transcript
 * @param chunkIndex - The index of this chunk (for logging)
 * @returns A condensed summary of the chunk
 */
async function summarizeChunk(chunk: string, chunkIndex: number): Promise<string> {
  console.log(`  Summarizing chunk ${chunkIndex + 1}...`);
  
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
 * Processes long transcripts by chunking and summarizing each piece,
 * then combining for final analysis. This prevents AI context limits
 * and improves output quality for long lectures.
 * 
 * @param transcription - The full lecture transcription
 * @returns Object with summary, structured notes, and Q&A pairs
 */
async function processLongTranscript(transcription: string): Promise<{
  summary: string;
  structuredNotes: { heading: string; points: string[] }[];
  qaPairs: { question: string; answer: string; marks: 2 | 4 }[];
}> {
  const wordCount = transcription.split(/\s+/).length;
  
  // Threshold: if transcript is longer than 1000 words, use chunking
  const CHUNK_THRESHOLD = 1000;
  
  if (wordCount <= CHUNK_THRESHOLD) {
    // Short transcript - process directly without chunking
    console.log(`Short transcript (${wordCount} words), processing directly...`);
    return await generateFinalContent(transcription);
  }

  // Long transcript - apply chunking strategy
  console.log(`Long transcript (${wordCount} words), applying chunking...`);
  
  // Step 1: Split into manageable chunks
  const chunks = splitIntoChunks(transcription, 600);
  console.log(`Split into ${chunks.length} chunks`);

  // Step 2: Generate mini-summary for each chunk
  const miniSummaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const summary = await summarizeChunk(chunks[i], i);
    miniSummaries.push(summary);
  }

  // Step 3: Combine all mini-summaries into consolidated text
  const consolidatedText = miniSummaries.join("\n\n");
  console.log(`Consolidated ${miniSummaries.length} mini-summaries`);

  // Step 4: Generate final structured output from consolidated summaries
  return await generateFinalContent(consolidatedText);
}

/**
 * Generates the final structured content (summary, notes, Q&A).
 * Called either with full transcript (short) or consolidated summaries (long).
 * 
 * @param content - Either full transcript or consolidated mini-summaries
 * @returns Structured output with summary, notes, and Q&A
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
// Used when AI API is unavailable to prevent complete failure
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
  // Main processing endpoint - handles both uploaded files and recorded audio
  app.post(api.process.path, upload.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file provided" });
      }

      console.log(`Processing file: ${req.file.originalname || "recording"}, Size: ${req.file.size} bytes`);

      // ============================================================
      // STEP 1: TRANSCRIPTION
      // Determine audio format and convert if needed
      // ============================================================
      
      let audioBuffer = req.file.buffer;
      let format: "wav" | "mp3" | "webm" = "webm";
      
      // Detect format from mimetype or filename
      const mimeType = req.file.mimetype.toLowerCase();
      const filename = (req.file.originalname || "").toLowerCase();
      
      if (mimeType.includes("wav") || filename.endsWith(".wav")) {
        format = "wav";
      } else if (mimeType.includes("mp3") || mimeType.includes("mpeg") || filename.endsWith(".mp3")) {
        format = "mp3";
      } else if (mimeType.includes("m4a") || filename.endsWith(".m4a")) {
        // M4A needs conversion - treat as webm for now
        format = "webm";
      } else if (mimeType.includes("webm") || filename.endsWith(".webm")) {
        // WebM from browser recording - convert to WAV for better transcription
        console.log("Converting WebM to WAV...");
        try {
          audioBuffer = await convertWebmToWav(req.file.buffer);
          format = "wav";
        } catch (convErr) {
          console.log("WebM conversion failed, trying direct:", convErr);
          format = "webm";
        }
      }
      
      console.log(`Transcribing audio (${format})...`);
      let transcription: string;
      
      try {
        transcription = await speechToText(audioBuffer, format);
      } catch (transcribeErr: any) {
        console.error("Transcription failed:", transcribeErr);
        return res.status(500).json({ 
          message: "Failed to transcribe audio. Please ensure the file is a valid audio recording." 
        });
      }
      
      console.log("Transcription complete, length:", transcription.length, "chars");

      // ============================================================
      // STEP 2: AI PROCESSING WITH CHUNKING
      // Process transcript (uses chunking for long lectures)
      // ============================================================
      
      let content;
      try {
        content = await processLongTranscript(transcription);
        console.log("AI processing complete");
      } catch (aiErr: any) {
        // If AI fails, return mock response with transcription
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
      res.status(500).json({ message: error.message || "Failed to process audio" });
    }
  });

  return httpServer;
}

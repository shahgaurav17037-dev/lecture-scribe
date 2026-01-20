import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { speechToText, openai } from "./replit_integrations/audio/client";

// Configure upload
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit (OpenAI limit)
  }
});

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.post(api.process.path, upload.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file provided" });
      }

      console.log(`Processing file: ${req.file.originalname}, Size: ${req.file.size} bytes`);

      // 1. Transcription
      // Determine format from extension or mimetype
      let format: "wav" | "mp3" | "webm" = "webm";
      if (req.file.mimetype.includes("wav") || req.file.originalname.endsWith(".wav")) format = "wav";
      else if (req.file.mimetype.includes("mp3") || req.file.originalname.endsWith(".mp3")) format = "mp3";
      
      console.log(`Transcribing (${format})...`);
      const transcription = await speechToText(req.file.buffer, format);
      console.log("Transcription complete, length:", transcription.length);

      // 2. Generate content with GPT
      const prompt = `
        You are an expert academic tutor. Process the following lecture transcript:
        
        TRANSCRIPT:
        "${transcription}"
        
        Generate the following in strict JSON format:
        1. "summary": A 150-200 word summary of the chapter/lecture.
        2. "structuredNotes": An array of objects, each with a "heading" and "points" (array of strings). Covers the main topics.
        3. "qaPairs": An array of exam-oriented questions and answers. 
           - Include a mix of 2-mark questions (definitions, short answers) and 4-mark questions (longer, bullet points).
           - "marks" field must be strictly 2 or 4.
        
        Ensure the JSON matches this schema exactly:
        {
          "summary": string,
          "structuredNotes": [{ "heading": string, "points": string[] }],
          "qaPairs": [{ "question": string, "answer": string, "marks": number }]
        }
      `;

      console.log("Generating notes...");
      const completion = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const content = JSON.parse(completion.choices[0].message.content || "{}");
      console.log("Generation complete");

      // Store in memory (for history if needed later)
      await storage.createNote({
        fileName: req.file.originalname,
        transcription,
        summary: content.summary || "No summary generated",
        structuredNotes: content.structuredNotes || [],
        qaPairs: content.qaPairs || [],
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

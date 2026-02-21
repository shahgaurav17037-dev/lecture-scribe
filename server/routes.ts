import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import { api } from "@shared/routes";
import { transcribeAudio } from "./services/transcription";
import { generateAISummary } from "./ai";
import { storage } from "./storage";

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

/* ---------------- AUDIO SPLIT ---------------- */

async function splitAudioIntoChunks(
  audioBuffer: Buffer,
  format: string
): Promise<Buffer[]> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-"));
  const inputPath = path.join(tempDir, `input.${format}`);
  const outputPattern = path.join(tempDir, "chunk_%03d.wav");

  try {
    fs.writeFileSync(inputPath, audioBuffer);

    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${inputPath}"`
    );

    const duration = parseFloat(stdout.trim());
    const CHUNK_DURATION = 180; // 3 minutes

    if (duration <= CHUNK_DURATION) {
      const wavPath = path.join(tempDir, "single.wav");
      await execAsync(
        `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 "${wavPath}" -y`
      );
      return [fs.readFileSync(wavPath)];
    }

    await execAsync(
      `ffmpeg -i "${inputPath}" -f segment -segment_time ${CHUNK_DURATION} -ar 16000 -ac 1 "${outputPattern}" -y`
    );

    return fs
      .readdirSync(tempDir)
      .filter((f) => f.startsWith("chunk_"))
      .sort()
      .map((f) => fs.readFileSync(path.join(tempDir, f)));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/* ---------------- SAFE TRANSCRIBE (FIXED) ---------------- */

async function transcribeChunks(chunks: Buffer[]): Promise<string> {
  const BATCH_SIZE = 5;
  const results: string[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    console.log(`🚀 Processing batch ${i / BATCH_SIZE + 1}`);

    const batchResults = await Promise.all(
      batch.map((chunk, index) => {
        console.log(`🎤 Transcribing chunk ${i + index + 1}`);
        return transcribeAudio(chunk);
      })
    );

    results.push(...batchResults);

    // Small delay to avoid hitting API rate limits
    await new Promise((res) => setTimeout(res, 1500));
  }

  return results.join("\n\n").trim();
}

/* ---------------- ROUTES ---------------- */

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post(api.process.path, upload.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file provided" });
      }

      /* ---------------- MODE ---------------- */

      const mode = req.body.mode === "numerical" ? "numerical" : "theory";
      console.log("📘 Selected Mode:", mode);

      /* ---------------- MARKS LIST ---------------- */

      let marksList: number[] = [2, 5];

      try {
        if (req.body.marksList) {
          const parsed = JSON.parse(req.body.marksList);

          if (Array.isArray(parsed)) {
            marksList = parsed
              .map((m) => Number(m))
              .filter((m) => !isNaN(m) && m > 0);
          }
        }
      } catch {
        console.log("Invalid marksList format, using default.");
      }

      marksList = marksList.slice(0, 2);
      console.log("📝 Selected Marks:", marksList);

      /* ---------------- AUDIO FORMAT ---------------- */

      let format = "webm";
      const name = req.file.originalname?.toLowerCase() || "";

      if (name.endsWith(".wav")) format = "wav";
      else if (name.endsWith(".mp3")) format = "mp3";
      else if (name.endsWith(".m4a")) format = "m4a";

      /* ---------------- PROCESS AUDIO ---------------- */

      const chunks = await splitAudioIntoChunks(req.file.buffer, format);
      console.log(`🔪 Total Chunks Created: ${chunks.length}`);

      const transcription = await transcribeChunks(chunks);

      if (!transcription) {
        return res.status(400).json({ message: "No speech detected" });
      }

      /* ---------------- AI SUMMARY ---------------- */

      const aiResult = await generateAISummary(
        transcription,
        mode,
        marksList
      );

      /* ---------------- SAVE ---------------- */

      await storage.createNote({
        fileName: req.file.originalname || "recording",
        transcription,
        summary: aiResult.summary,
        structuredNotes: aiResult.structuredNotes,
        qaPairs: aiResult.qaPairs,
      });

      res.json(aiResult);

    } catch (err: any) {
      console.error(err);
      res.status(500).json({
        message: err.message || "Processing failed",
      });
    }
  });

  return httpServer;
}

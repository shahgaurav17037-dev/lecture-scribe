import { AssemblyAI } from "assemblyai";

// ✅ Create client INSIDE this file
const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY!,
});

/**
 * Transcribe an audio buffer using AssemblyAI
 */
export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  // Upload buffer → returns STRING URL
  const audioUrl = await client.files.upload(audioBuffer);

  // Create transcript
  const transcript = await client.transcripts.create({
    audio_url: audioUrl,
    language_detection: true,
  });

  return transcript.text ?? "";
}

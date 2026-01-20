import { z } from 'zod';
import { structuredNoteItemSchema, qaPairItemSchema } from './schema';

export const api = {
  process: {
    method: 'POST' as const,
    path: '/api/process-audio',
    // Input is FormData (file), so body schema is optional or partial
    responses: {
      200: z.object({
        transcription: z.string(),
        summary: z.string(),
        structuredNotes: z.array(structuredNoteItemSchema),
        qaPairs: z.array(qaPairItemSchema),
      }),
      400: z.object({ message: z.string() }),
      500: z.object({ message: z.string() }),
    },
  },
};

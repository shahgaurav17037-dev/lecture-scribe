import { pgTable, text, serial, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// We define the table even for MemStorage to reuse types
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  transcription: text("transcription").notNull(),
  summary: text("summary").notNull(),
  // Stored as JSONB in DB, but we strictly type it for TS
  structuredNotes: jsonb("structured_notes").$type<{ heading: string; points: string[] }[]>().notNull(),
  qaPairs: jsonb("qa_pairs").$type<{ question: string; answer: string; marks: 2 | 4 }[]>().notNull(),
});

export const insertNoteSchema = createInsertSchema(notes).omit({ id: true });

export type Note = typeof notes.$inferSelect;
export type InsertNote = z.infer<typeof insertNoteSchema>;

// Explicit sub-types for frontend usage
export const structuredNoteItemSchema = z.object({
  heading: z.string(),
  points: z.array(z.string()),
});

export const qaPairItemSchema = z.object({
  question: z.string(),
  answer: z.string(),
  marks: z.union([z.literal(2), z.literal(4)]),
});

export type StructuredNoteItem = z.infer<typeof structuredNoteItemSchema>;
export type QaPairItem = z.infer<typeof qaPairItemSchema>;

import { type Note, type InsertNote } from "@shared/schema";

export interface IStorage {
  createNote(note: InsertNote): Promise<Note>;
}

export class MemStorage implements IStorage {
  private notes: Map<number, Note>;
  private currentId: number;

  constructor() {
    this.notes = new Map();
    this.currentId = 1;
  }

  async createNote(insertNote: InsertNote): Promise<Note> {
    const id = this.currentId++;
    const note: Note = { ...insertNote, id };
    this.notes.set(id, note);
    return note;
  }
}

export const storage = new MemStorage();

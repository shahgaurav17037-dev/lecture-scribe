import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

export type LectureMode = "theory" | "numerical";

export interface AISummary {
  transcription: string;
  summary: string;
  structuredNotes: {
    heading: string;
    points: string[];
  }[];
  qaPairs: {
    question: string;
    answer: string;
    marks: number;
  }[];
}

/* ---------------- TOKEN SAFE CHUNKING ---------------- */

function chunkText(text: string, maxLength = 3500): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    chunks.push(text.slice(start, start + maxLength));
    start += maxLength;
  }

  return chunks;
}

/* ---------------- SAFE JSON PARSER ---------------- */

function safeJSONParse(content: string): any | null {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (err) {
    console.error("JSON parse failed:", err);
    return null;
  }
}

/* ---------------- UNIVERSAL ACADEMIC PROMPT ---------------- */

function buildSummaryPrompt(chunk: string) {
  return `
You are a STRICT university-level academic assistant capable of handling ANY discipline 
including business, computer science, software engineering, engineering, mathematics, 
social sciences, and management.

ACADEMIC RULES:
1. Base ALL explanations strictly on the transcript.
2. Do NOT introduce external theories, examples, algorithms, or case studies.
3. Preserve discipline-specific terminology exactly.
4. If the lecture is technical (code, algorithms, OS, networking, DBMS, architecture, etc.):
   - Maintain technical correctness.
   - Do NOT oversimplify.
   - Do NOT change algorithm logic.
   - Do NOT invent complexity analysis.
5. If the lecture is numerical:
   - Preserve formulas accurately.
   - Maintain variable meaning.
6. If unclear, summarize conservatively.
7. Internally translate mixed Hindi into proper academic English.
8. Final output must be 100% English.
9. Maintain university-level academic tone.

Return ONLY valid JSON in this EXACT format:

{
  "summary": "Concise academic summary strictly based on transcript",
  "structuredNotes": [
    {
      "heading": "Actual topic or concept mentioned",
      "points": ["Accurate academic point", "Accurate academic point"]
    }
  ]
}

Transcript:
${chunk}
`;
}

/* ---------------- MAIN AI FUNCTION ---------------- */

export async function generateAISummary(
  transcript: string,
  mode: LectureMode,
  marksList: number[]
): Promise<AISummary> {
  const chunks = chunkText(transcript);

  let combinedSummary = "";
  let combinedNotes: AISummary["structuredNotes"] = [];

  const BATCH_SIZE = 3; // safer for 8B model

  /* ---------------- STEP 1: SUMMARIZE CHUNKS ---------------- */

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (chunk) => {
        try {
          const completion = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [{ role: "user", content: buildSummaryPrompt(chunk) }],
            temperature: 0.2,
          });

          const content = completion.choices[0]?.message?.content;
          if (!content) return null;

          return safeJSONParse(content);
        } catch (err) {
          console.error("Chunk parsing failed:", err);
          return null;
        }
      })
    );

    for (const parsed of results) {
      if (!parsed) continue;

      combinedSummary += " " + parsed.summary;
      combinedNotes.push(...parsed.structuredNotes);
    }

    await new Promise((res) => setTimeout(res, 1200));
  }

  /* ---------------- STEP 2: GENERATE QUESTIONS ---------------- */

  const questionPrompt = `
You are a STRICT university-level exam question generator.

RULES:
1. Use ONLY the provided lecture summary.
2. Do NOT introduce new concepts, algorithms, theories, or examples.
3. Maintain discipline-specific terminology.
4. For technical subjects:
   - Preserve algorithm correctness.
   - Maintain conceptual precision.
5. Match answer depth strictly to marks.
6. Maintain academic tone.
7. Output must be 100% English.

Lecture Summary:
${combinedSummary}

Allowed marks types:
${marksList.map((m) => `- ${m} marks`).join("\n")}

Return ONLY valid JSON:

{
  "qaPairs": [
    {
      "question": "",
      "answer": "",
      "marks": number
    }
  ]
}
`;

  let combinedQA: AISummary["qaPairs"] = [];

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: questionPrompt }],
      temperature: 0.2,
    });

    const content = completion.choices[0]?.message?.content;

    if (content) {
      const parsed = safeJSONParse(content);
      combinedQA = parsed?.qaPairs || [];
    }
  } catch (err) {
    console.error("Q&A generation failed:", err);
  }

  combinedQA = combinedQA.filter((qa) => marksList.includes(qa.marks));

  return {
    transcription: transcript,
    summary: combinedSummary.trim(),
    structuredNotes: combinedNotes,
    qaPairs: combinedQA,
  };
}
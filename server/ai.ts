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
    // Extract JSON block if extra text is present
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (err) {
    console.error("JSON parse failed:", err);
    return null;
  }
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

  const BATCH_SIZE = 5;

  /* ---------------- STEP 1: SUMMARIZE CHUNKS ---------------- */

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (chunk) => {
        const prompt =
          mode === "numerical"
            ? `
You are a numerical subject academic assistant.

IMPORTANT LANGUAGE RULES:
- The transcript may be in Hindi or mixed language.
- Internally translate everything into clear academic English.
- The final output must be 100% English.
- Do NOT include any Hindi words.
- Do NOT mix languages.
- Do NOT transliterate Hindi into English letters.
- Rewrite unclear phrases into proper academic English.

Return ONLY valid JSON in this exact format:

{
  "summary": "short academic English summary",
  "structuredNotes": [
    {
      "heading": "Formula or Concept",
      "points": ["point1", "point2"]
    }
  ]
}

Transcript:
${chunk}
`
            : `
You are an academic lecture assistant.

IMPORTANT LANGUAGE RULES:
- The transcript may be in Hindi or mixed language.
- Internally translate everything into clear academic English.
- The final output must be 100% English.
- Do NOT include any Hindi words.
- Do NOT mix languages.
- Do NOT transliterate Hindi into English letters.
- Rewrite unclear phrases into proper academic English.

Return ONLY valid JSON in this exact format:

{
  "summary": "short academic English summary",
  "structuredNotes": [
    {
      "heading": "Topic",
      "points": ["point1", "point2"]
    }
  ]
}

Transcript:
${chunk}
`;

        try {
          const completion = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [{ role: "user", content: prompt }],
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
You are a university-level exam question generator.

IMPORTANT LANGUAGE RULES:
- The content must be strictly in English.
- Do NOT include Hindi words.
- Do NOT mix languages.
- Do NOT transliterate Hindi.
- Maintain academic tone.
- Ensure answers are clear and structured.

Based on this lecture summary:

${combinedSummary}

Generate exam-style questions.

Allowed marks types:
${marksList.map((m) => `- ${m} marks`).join("\n")}

STRICT RULES:
- Only use the marks listed above
- Do NOT invent other marks
- Match answer length with marks
- University-level quality
- Return ONLY valid JSON:

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

  /* ---------------- SAFETY FILTER ---------------- */

  combinedQA = combinedQA.filter((qa) => marksList.includes(qa.marks));

  return {
    transcription: transcript,
    summary: combinedSummary.trim(),
    structuredNotes: combinedNotes,
    qaPairs: combinedQA,
  };
}
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const intakeDirectory = path.join(root, "word-intake");
const outputDirectory = path.join(root, "processed-words");
const errorDirectory = path.join(root, "processing-errors");

export function validIntake(record) {
  return Boolean(record && typeof record.id === "string" && /^\d{4}-\d{2}-\d{2}-\d{6}$/.test(record.id)
    && typeof record.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.date)
    && typeof record.content === "string" && record.content.trim()
    && record.content.trim() !== record.id
    && record.status !== "published" && record.status !== "needs_review");
}

export function validVocabularySet(set) {
  return Boolean(set && typeof set === "object" && set.id && /^\d{4}-\d{2}-\d{2}$/.test(set.date)
    && set.label && Array.isArray(set.words) && set.words.length
    && set.words.every((word) => word.term && word.meaning && word.pronunciation && word.type && word.register
      && word.pattern && word.cue && word.businessExample && word.everydayExample && word.contrast && word.recallPrompt)
    && Array.isArray(set.questions) && set.questions.length
    && set.questions.every((question) => question.prompt && question.answer && Array.isArray(question.accepted) && question.accepted.length && question.note)
    && set.story && set.story.title && Array.isArray(set.story.cues) && Array.isArray(set.story.paragraphs) && Array.isArray(set.story.highlights));
}

const vocabularySchema = {
  type: "object",
  additionalProperties: false,
  required: ["words", "story", "questions"],
  properties: {
    words: {
      type: "array", minItems: 1,
      items: {
        type: "object", additionalProperties: false,
        required: ["term", "meaning", "pronunciation", "type", "register", "pattern", "cue", "businessExample", "everydayExample", "contrast", "recallPrompt"],
        properties: {
          term: { type: "string" }, meaning: { type: "string" }, pronunciation: { type: "string" },
          type: { type: "string" }, register: { type: "string" }, pattern: { type: "string" },
          cue: { type: "string" }, businessExample: { type: "string" }, everydayExample: { type: "string" },
          contrast: { type: "string" }, recallPrompt: { type: "string" },
        },
      },
    },
    story: {
      type: "object", additionalProperties: false,
      required: ["title", "cues", "paragraphs", "highlights"],
      properties: {
        title: { type: "string" }, cues: { type: "array", items: { type: "string" }, minItems: 2 },
        paragraphs: { type: "array", items: { type: "string" }, minItems: 2 },
        highlights: { type: "array", items: { type: "string" }, minItems: 1 },
      },
    },
    questions: {
      type: "array", minItems: 2,
      items: {
        type: "object", additionalProperties: false,
        required: ["prompt", "answer", "accepted", "note"],
        properties: {
          prompt: { type: "string" }, answer: { type: "string" },
          accepted: { type: "array", items: { type: "string" }, minItems: 1 }, note: { type: "string" },
        },
      },
    },
  },
};

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) if (content.type === "output_text" && typeof content.text === "string") return content.text;
  }
  throw new Error("The enrichment response did not contain structured text.");
}

function websiteSet(record, enriched) {
  return {
    id: `auto-${record.id}`,
    intakeId: record.id,
    date: record.date,
    label: "Automatic · iPhone Words",
    source: record.source || "iphone words",
    status: "published",
    reviewDates: { day3: addDays(record.date, 3), day5: addDays(record.date, 5), day15: addDays(record.date, 15) },
    words: enriched.words.map((word) => ({
      term: word.term.trim(), meaning: word.meaning.trim(), pronunciation: word.pronunciation.trim(),
      type: word.type.trim(), register: word.register.trim(), pattern: word.pattern.trim(), cue: word.cue.trim(),
      example: word.businessExample.trim(), businessExample: word.businessExample.trim(), everydayExample: word.everydayExample.trim(),
      contrast: word.contrast.trim(), recallPrompt: word.recallPrompt.trim(),
    })),
    story: enriched.story,
    questions: enriched.questions,
    processedAt: new Date().toISOString(),
  };
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function enrich(record, apiKey, model) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: "You are an advanced English vocabulary coach for a global FMCG executive. Produce concise, natural, globally useful English. Preserve intentional phrases and phrasal verbs. Use supplied context to choose the intended sense. If context is absent and an item is ambiguous, choose the common sense most useful in business and everyday communication. Tests must require production, not recognition. Create a short realistic business story and never invent quotations or facts." },
        { role: "user", content: `Vocabulary submitted: ${record.content.trim()}\nOptional context: ${(record.context || "No context supplied").trim()}` },
      ],
      text: { format: { type: "json_schema", name: "vocabulary_set", strict: true, schema: vocabularySchema } },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI API returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return JSON.parse(outputText(await response.json()));
}

async function writeError(record, file, message) {
  await mkdir(errorDirectory, { recursive: true });
  await writeFile(path.join(errorDirectory, `${record.id || path.basename(file, ".json")}.json`), `${JSON.stringify({ id: record.id, file, status: "needs_review", error: message, recordedAt: new Date().toISOString() }, null, 2)}\n`);
  if (record.id) await writeFile(path.join(intakeDirectory, file), `${JSON.stringify({ ...record, status: "needs_review", processingError: message }, null, 2)}\n`);
}

export async function processPending({ apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL || "gpt-5.6-luna" } = {}) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing. Add it as a GitHub Actions repository secret.");
  await mkdir(outputDirectory, { recursive: true });
  const files = (await readdir(intakeDirectory)).filter((file) => file.endsWith(".json")).sort();
  let published = 0;
  for (const file of files) {
    const record = JSON.parse(await readFile(path.join(intakeDirectory, file), "utf8"));
    if (!validIntake(record) || existsSync(path.join(outputDirectory, `${record.id}.json`))) continue;
    try {
      const enriched = await enrich(record, apiKey, model);
      const set = websiteSet(record, enriched);
      if (!validVocabularySet(set)) throw new Error("The generated vocabulary record failed validation.");
      await writeFile(path.join(outputDirectory, `${record.id}.json`), `${JSON.stringify(set, null, 2)}\n`);
      await writeFile(path.join(intakeDirectory, file), `${JSON.stringify({ ...record, status: "published", processedAt: set.processedAt, output: `processed-words/${record.id}.json` }, null, 2)}\n`);
      published += 1;
    } catch (error) {
      await writeError(record, file, error instanceof Error ? error.message : String(error));
    }
  }
  return published;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const published = await processPending();
  console.log(`Published ${published} vocabulary intake record(s).`);
}

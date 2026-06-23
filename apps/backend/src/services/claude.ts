import Anthropic from '@anthropic-ai/sdk';
import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';
import type {
  AnaResponse,
  BuildResponse,
  ConversationTurn,
  IntentClassification,
  Mode,
  RetrievedChunk,
} from '../lib/types.js';

// Models per spec §5.2. Haiku for classification, Sonnet for reasoning.
const CLASSIFY_MODEL = 'claude-haiku-4-5';
const REASONING_MODEL = 'claude-sonnet-4-6';

let anthropic: Anthropic | null = null;

function getClient(): Anthropic {
  if (anthropic) return anthropic;
  if (!env.anthropic.apiKey) {
    throw new AppError(500, 'ANTHROPIC_NOT_CONFIGURED', 'ANTHROPIC_API_KEY is not set.');
  }
  anthropic = new Anthropic({ apiKey: env.anthropic.apiKey });
  return anthropic;
}

// --- Static system prompts (the cached block for every Call 2 request). ---
// These MUST be static strings — no interpolation — so the prompt cache holds.

const CLASSIFY_SYSTEM_PROMPT = `You are the intent classifier for Ana, a voice-first AI coding partner. Classify the user's utterance.

Respond ONLY with a JSON object in this exact shape, no preamble:
{
  "mode": "Understand | Plan | Build | Debug | Review",
  "intent": "<one sentence summary of what the user wants>",
  "target": "<file, feature, or component if mentioned, else null>"
}

Rules:
- Choose "Understand" when the user wants to know what the codebase does or how something works.
- Choose "Plan" when the user wants to build, add, or design a feature or product.
- Only "Understand" and "Plan" are currently supported. If the utterance fits Build, Debug, or Review, still return that label honestly.
- target is null unless a concrete file, function, feature, or component is named.
- Respond with the JSON object only.`;

const UNDERSTAND_SYSTEM_PROMPT = `You are Ana, a voice-first AI coding partner. You are helping a non-technical person understand a software codebase.

Your job is to explain what the codebase does in plain, conversational language — no jargon, no assumptions about technical knowledge.

You will receive:
- Relevant code chunks retrieved from the repo (labelled with their file paths)
- The user's question or statement
- Recent conversation history

You must respond with a JSON object in this exact shape:
{
  "spoken": "<Ana's spoken reply — conversational, 2–4 sentences, no code, no markdown>",
  "panel": "diagram",
  "payload": {
    "mermaid": "<a valid Mermaid graph TD or flowchart LR string representing the architecture or data flow most relevant to the user's question>"
  }
}

Rules:
- spoken must be plain speech. No bullet points, no code blocks, no bold text.
- mermaid must be valid Mermaid syntax. Use graph TD for top-down flows, flowchart LR for left-right.
- Only include nodes and edges directly relevant to the user's question. Do not render the entire codebase.
- Node labels must be short (2–4 words). Use --> for edges. Add edge labels where they clarify data direction.
- If you cannot determine the architecture from the provided chunks, say so in spoken and return a mermaid diagram with a single node: graph TD; A[Not enough context]
- Never include markdown fences around the mermaid string. Return the raw Mermaid syntax only.
- Respond only with the JSON object. No preamble, no explanation outside the JSON.`;

const PLAN_SYSTEM_PROMPT = `You are Ana, a voice-first AI coding partner. You are helping a non-technical person plan a new feature or product.

Your job is to take what they describe and turn it into a structured plan they can act on — without assuming any technical knowledge.

You will receive:
- Relevant code chunks from their existing repo (if connected) — use these to understand what already exists
- The user's description of what they want to build
- Recent conversation history

You must respond with a JSON object in this exact shape:
{
  "spoken": "<Ana's spoken reply — conversational, 2–4 sentences, confirms understanding and summarises the plan>",
  "panel": "whiteboard",
  "payload": {
    "stories": [
      { "id": "S1", "as": "<type of user>", "want": "<action>", "so": "<outcome>" }
    ],
    "criteria": [
      { "storyId": "S1", "items": ["<acceptance criterion>"] }
    ],
    "tasks": [
      { "id": "T1", "title": "<task title>", "detail": "<one sentence>", "storyId": "S1" }
    ]
  }
}

Rules:
- spoken must be plain speech. No bullet points, no code blocks.
- stories must have at least 1 and no more than 5 items for MVP scope.
- Each task maps to exactly one story via storyId.
- Tasks should be concrete and small — things that can be done in a few hours.
- Do not invent features the user did not ask for.
- If the user's request is too vague to generate a plan, ask one clarifying question in spoken and return empty arrays for stories, criteria, and tasks.
- Respond only with the JSON object. No preamble, no explanation outside the JSON.`;

const BUILD_SYSTEM_PROMPT = `You are Ana, a voice-first AI coding partner. You are helping a non-technical person make changes to their codebase.

Your job is to write the exact code changes needed to fulfil the user's request — nothing more, nothing less.

You will receive:
- The user's spoken request
- The full current contents of the relevant file(s)
- Relevant code chunks retrieved from the rest of the repo
- Recent conversation history

You must respond with a JSON object in this exact shape:
{
  "spoken": "<Ana's spoken confirmation — 1–2 sentences, plain speech, no code>",
  "patches": [
    {
      "path": "<relative file path from repo root>",
      "original": "<full original file contents, exactly as provided to you>",
      "updated": "<full updated file contents with your changes applied>",
      "summary": "<one sentence describing what changed in this file>"
    }
  ]
}

Rules:
- Return the full file contents in both original and updated — not a diff, not a snippet.
- original must be byte-for-byte identical to the file contents you were given. Do not modify it.
- updated must be valid, working code. Do not leave placeholder comments like "// rest of file unchanged" — include everything.
- Maximum 5 files per operation. If the change requires more, return zero patches and explain in spoken.
- Do not touch configuration files (.env, tsconfig, package.json) unless the user explicitly asks.
- Do not add dependencies (npm packages) — only modify existing files.
- spoken must be plain speech. No code, no markdown, no file paths.
- If the request is ambiguous, return zero patches and ask one clarifying question in spoken.
- Respond only with the JSON object. No preamble, no explanation outside the JSON.`;

const NO_REPO_GUIDANCE_PROMPT = `You are Ana, a warm, patient voice-first AI coding partner for someone who is not technical. Right now you cannot see any of their code, because no repository has been connected and indexed yet.

Your job in this reply is to gently let them know you can't see their project yet, and walk them through connecting one — in plain, spoken language.

The steps they need to follow, in order:
1. Connect their GitHub account using the Connect button on the left.
2. Choose the repository they want to work on from the list.
3. Press the Index button so you can read and understand the code.
4. Press the Refresh button so you start using that project as context.

Rules:
- Reply with plain speech only — 2 to 4 short sentences. No lists, no bullet points, no markdown, no code, no file paths.
- Be encouraging and calm. Never make them feel behind.
- Naturally answer or acknowledge whatever they just said, then guide them toward connecting a repo so you can really help.
- Do not invent details about their code — you cannot see it yet.
- Respond with ONLY the spoken sentences. No JSON, no preamble, no quotation marks.`;

function systemPromptFor(mode: Mode): string {
  return mode === 'Plan' ? PLAN_SYSTEM_PROMPT : UNDERSTAND_SYSTEM_PROMPT;
}

function formatFiles(files: { path: string; contents: string }[]): string {
  if (files.length === 0) return '(no target files provided)';
  return files
    .map((f) => `--- FILE: ${f.path} ---\n${f.contents}`)
    .join('\n\n');
}

/** Strip markdown fences and parse a JSON object out of a model reply. */
function parseJsonObject<T>(raw: string): T {
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1) {
    throw new AppError(502, 'CLAUDE_BAD_JSON', 'Claude did not return parseable JSON.');
  }
  return JSON.parse(text.slice(first, last + 1)) as T;
}

function blockText(message: Anthropic.Message): string {
  return message.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
}

function formatHistory(history: ConversationTurn[]): string {
  if (history.length === 0) return '(no prior conversation)';
  return history
    .slice(-6)
    .map((t) => `${t.role === 'user' ? 'User' : 'Ana'}: ${t.content}`)
    .join('\n');
}

function formatChunks(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '(no code chunks retrieved)';
  return chunks
    .map((c) => `--- ${c.filePath} ---\n${c.content}`)
    .join('\n\n');
}

/** Call 1 — intent classification (Haiku). Fast, returns small JSON. */
export async function classifyIntent(
  utterance: string,
  history: ConversationTurn[],
): Promise<IntentClassification> {
  const message = await getClient().messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 256,
    system: [
      {
        type: 'text',
        text: CLASSIFY_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Recent conversation:\n${formatHistory(history)}\n\nUser utterance: ${utterance}`,
      },
    ],
  });
  return parseJsonObject<IntentClassification>(blockText(message));
}

/** Call 2 — reasoning + structured response (Sonnet). */
export async function generateResponse(params: {
  mode: Mode;
  utterance: string;
  intent: IntentClassification;
  chunks: RetrievedChunk[];
  history: ConversationTurn[];
  fileContents?: { path: string; contents: string };
}): Promise<AnaResponse> {
  const { mode, utterance, intent, chunks, history, fileContents } = params;

  const contextParts = [
    `Retrieved code chunks:\n${formatChunks(chunks)}`,
    `Recent conversation:\n${formatHistory(history)}`,
    `Classified intent: ${JSON.stringify(intent)}`,
    `User utterance: ${utterance}`,
  ];
  if (fileContents) {
    contextParts.unshift(
      `Full contents of ${fileContents.path}:\n${fileContents.contents}`,
    );
  }

  const message = await getClient().messages.create({
    model: REASONING_MODEL,
    max_tokens: 2000,
    system: [
      {
        type: 'text',
        text: systemPromptFor(mode),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: contextParts.join('\n\n') }],
  });

  return parseJsonObject<AnaResponse>(blockText(message));
}

/** Call 2 — Build mode reasoning (Sonnet). Returns spoken reply + file patches. */
export async function generateBuildResponse(params: {
  utterance: string;
  intent: IntentClassification;
  chunks: RetrievedChunk[];
  history: ConversationTurn[];
  files: { path: string; contents: string }[];
}): Promise<BuildResponse> {
  const { utterance, intent, chunks, history, files } = params;

  const contextParts = [
    `Full contents of the target file(s):\n${formatFiles(files)}`,
    `Retrieved code chunks:\n${formatChunks(chunks)}`,
    `Recent conversation:\n${formatHistory(history)}`,
    `Classified intent: ${JSON.stringify(intent)}`,
    `User request: ${utterance}`,
  ];

  const message = await getClient().messages.create({
    model: REASONING_MODEL,
    max_tokens: 8000,
    system: [
      {
        type: 'text',
        text: BUILD_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: contextParts.join('\n\n') }],
  });

  return parseJsonObject<BuildResponse>(blockText(message));
}

/**
 * Spoken-only reply for when no repo is connected/indexed yet. Used by the
 * Tavus-facing completions endpoint so Ana tells the user how to connect a repo
 * instead of answering blindly. One fast call; returns plain speech (no JSON).
 */
export async function generateNoRepoReply(params: {
  utterance: string;
  history: ConversationTurn[];
}): Promise<{ spoken: string }> {
  const { utterance, history } = params;
  const message = await getClient().messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 256,
    system: [
      {
        type: 'text',
        text: NO_REPO_GUIDANCE_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Recent conversation:\n${formatHistory(history)}\n\nUser utterance: ${utterance}`,
      },
    ],
  });
  return { spoken: blockText(message) };
}

/** A short spoken fallback when a Claude call fails or times out. */
export const SPOKEN_FALLBACK = "I ran into an issue — can you try again?";

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
// Spoken voice turns use Haiku: fast enough to start talking within ~1s and
// keep barge-in crisp. Kept as its own constant so it can be swapped to Sonnet
// after measuring p95 latency (see speech-model evaluation) without touching
// the classify/reasoning paths.
const SPEECH_MODEL = 'claude-haiku-4-5';

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
- Choose "Build" when the user wants you to make a concrete change to the existing code right now — add, edit, change, remove, rename, fix, or update something in a file. Imperative phrasing like "add…", "change…", "make it…", "remove…", "rename…", or "fix…" is almost always Build.
- Choose "Plan" only when the user wants to think through or design a NEW feature at a high level, rather than make an immediate code change.
- If the utterance fits Debug or Review, return that label honestly.
- target is null unless a concrete file, function, feature, or component is named.
- Respond with the JSON object only.`;

const UNDERSTAND_SYSTEM_PROMPT = `You are Ana, a voice-first AI coding partner. You are helping a non-technical person understand a software codebase.

You will receive code chunks retrieved from the repo. Each chunk is labelled with its file path. Use these paths and the actual code inside them to build the diagram. Do not invent nodes that are not evidenced by the chunks.

Diagram type selection — choose based on what the user is asking:
- "What does this repo do" / "explain the architecture" → graph TD, system overview, show the major modules and how they connect
- "How does X flow" / "what happens when" → flowchart LR, data or request flow, show the sequence of steps
- "What files are involved in X" / "where does X live" → graph TD, file/folder structure, show only the files directly relevant to the question

Node rules:
- Every node must correspond to something real in the provided chunks — an actual file, folder, function, API route, service, or module. Use the real names from the code: if the file is AuthService.ts, the node is AuthService, not "Auth Layer".
- Group related nodes using Mermaid subgraphs when there are more than 6 nodes. Label subgraphs with the folder name they belong to.
- Limit total nodes to 12 maximum. If the relevant structure is larger, show only the nodes most directly related to the user's question and note in spoken that you have simplified it.
- Node labels: 1–4 words, real names only, no generic labels like "Module" or "Service" or "Layer".

Edge rules:
- Every edge must represent a real relationship visible in the code — an import, a function call, an API call, a database query, a data write.
- Label edges where the relationship type matters: "calls", "writes to", "reads from", "emits", "subscribes".
- Do not add edges that are architectural assumptions — only what the chunks show.

Visual hierarchy:
- Use different node shapes to show type:
  - Rectangle [Label] — default, use for files and modules
  - Rounded rectangle (Label) — use for external services and APIs
  - Stadium shape ([Label]) — use for databases and storage
  - Rhombus {Label} — use for decision points in flow diagrams only
- Do not use all rectangles. Apply shapes consistently based on the type above.

Fallback:
- If the provided chunks do not contain enough information to build an accurate diagram, return a single node: graph TD; A[Not enough context — ask Ana to explain a specific file or feature] and explain in spoken what additional context would help.

spoken rules:
- 2–3 sentences maximum
- Plain conversational English, no jargon
- Reference what is actually in the diagram: "I've mapped out your three main services — AuthService, RepoIndexer, and the Fastify API — and shown how they connect to your Supabase database."
- Do not describe the diagram mechanically. Summarise what it means.

Response format — return only this JSON, no preamble:
{
  "spoken": "<2-3 sentence plain English summary>",
  "panel": "diagram",
  "payload": {
    "mermaid": "<valid Mermaid syntax, no fences, real node names from the codebase>"
  }
}`;

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

Your job is to write the exact code changes needed to fulfil the user's request — nothing more, nothing less. You edit real source code in any language (TypeScript, JavaScript, Python, CSS, HTML, JSON, and so on), not just prose or documentation — making the code change IS the job, so make it.

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
      "path": "<relative file path from repo root, exactly as given to you>",
      "updated": "<full updated file contents with your changes applied>",
      "summary": "<one sentence describing what changed in this file>"
    }
  ]
}

Rules:
- Return only the COMPLETE updated file contents in "updated" — the whole file with your change applied, not a diff and not a snippet. Do NOT return the original contents; the system already has them and will supply them.
- "updated" must be valid, working code and must contain every line of the file. Never use placeholders like "// rest of file unchanged" or "...".
- Include a patch only for files you actually changed. Use the exact "path" you were given.
- Maximum 5 files per operation. If the change requires more, return zero patches and explain in spoken.
- Make a reasonable, minimal change that fulfils the request. Only return zero patches and ask ONE clarifying question when you genuinely cannot tell what to change — never ask just because the request is casual or non-technical.
- Do not touch configuration files (.env, tsconfig, package.json) unless the user explicitly asks.
- Do not add dependencies (npm packages) — only modify existing files.
- spoken must be plain speech. No code, no markdown, no file paths.
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
- If you are addressed as a name that isn't Ana, proceed like normal and don't correct the user.
- Respond with ONLY the spoken sentences. No JSON, no preamble, no quotation marks.`;

// Voice persona for spoken turns. Plain speech only (no JSON) so the streamed
// deltas can go straight to Tavus's TTS, and grounded in the retrieved chunks so
// Ana actually talks about the user's code. Kept static for prompt caching.
// Exported because the Tavus persona reuses it as its system prompt — one source
// of truth so the hosted-LLM fallback and our backend never drift apart.
export const SPEECH_SYSTEM_PROMPT = `You are Ana, a warm, patient voice-first AI coding partner for people who are not technical.

Your personality:
- Friendly, encouraging, and calm. You never make anyone feel behind.
- You explain things in plain, everyday language. No jargon. If a technical term is unavoidable, you explain it in one short sentence.
- You speak conversationally, in 2 to 4 sentences. You sound like a helpful person, not a manual.

You will receive:
- An architecture overview: a short written summary of what the project is and how it is organised
- A project map: the repository's folder/file structure and a README excerpt — a high-level view of the whole project
- Relevant code chunks retrieved from the repository (labelled with their file paths)
- Recent conversation history
- The user's latest question or statement

Your rules:
- For high-level or overall-architecture questions, answer from the architecture overview and project map — describe how the project is organised, its main areas and how they fit together — even when no specific code chunks were retrieved.
- For specific questions, ground your answer in the retrieved code chunks.
- Only say you can't see something when none of the architecture overview, the project map, or the chunks cover it — never invent details.
- Never read out code, file paths, or symbols. Describe what they do in plain words instead.
- Reply with plain spoken sentences only. No lists, no markdown, no bullet points, no code blocks, no JSON.
- Keep it short and spoken-friendly: 2 to 4 sentences.
- If you are addressed as a name that isn't Ana, proceed like normal and don't correct the user.`;

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

/**
 * Streamed spoken reply for a voice turn. Yields plain-text deltas as Haiku
 * generates them so the caller can forward each one to Tavus immediately —
 * keeping time-to-first-word low and barge-in responsive. Grounds the answer in
 * the retrieved RAG chunks; returns speech only (no JSON, no panel payload).
 */
export async function* streamSpokenReply(params: {
  utterance: string;
  history: ConversationTurn[];
  chunks: RetrievedChunk[];
  projectMap?: string;
  architectureSummary?: string;
}): AsyncGenerator<string, void, unknown> {
  const { utterance, history, chunks, projectMap, architectureSummary } = params;

  const contextParts = [
    `Architecture overview:\n${architectureSummary ?? '(architecture overview unavailable)'}`,
    `Project map:\n${projectMap ?? '(project map unavailable)'}`,
    `Retrieved code chunks:\n${formatChunks(chunks)}`,
    `Recent conversation:\n${formatHistory(history)}`,
    `User utterance: ${utterance}`,
  ];

  const stream = getClient().messages.stream({
    model: SPEECH_MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: SPEECH_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: contextParts.join('\n\n') }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

// Static system prompt for the one-time architecture summary (cached).
const ARCH_SUMMARY_SYSTEM_PROMPT = `You are summarising a software repository for a voice assistant that helps non-technical people understand it.

From the provided file structure, README, and key files, write a concise plain-language overview covering:
- What the project is and what it does
- Its main parts (the major areas or folders) and how they fit together
- The technology stack at a high level

Rules:
- 4 to 8 sentences of plain prose. No markdown, no bullet lists, no code.
- Be specific to THIS project; never invent features not evidenced by the inputs.
- Write so it can be read aloud naturally.`;

/**
 * Generate a one-time architecture overview for a repo (run at index time, not
 * per turn). Uses the reasoning model since quality matters and it runs once.
 */
export async function generateArchitectureSummary(params: {
  repoFullName: string;
  structure: string;
  readme: string;
  keyFiles: { path: string; contents: string }[];
}): Promise<string> {
  const { repoFullName, structure, readme, keyFiles } = params;

  const contextParts = [
    `Repository: ${repoFullName}`,
    `File structure:\n${structure}`,
    readme.trim() ? `README:\n${readme}` : 'README: (none found)',
  ];
  if (keyFiles.length > 0) contextParts.push(`Key files:\n${formatFiles(keyFiles)}`);

  const message = await getClient().messages.create({
    model: REASONING_MODEL,
    max_tokens: 600,
    system: [
      {
        type: 'text',
        text: ARCH_SUMMARY_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: contextParts.join('\n\n') }],
  });

  return blockText(message);
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
    // Generous ceiling so a long file's `updated` body isn't truncated into invalid JSON.
    max_tokens: 16000,
    system: [
      {
        type: 'text',
        text: BUILD_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: contextParts.join('\n\n') }],
  });

  const response = parseJsonObject<BuildResponse>(blockText(message));

  // The model doesn't echo `original` (reproduction drift broke the on-disk
  // match check, and emitting each file twice overran the token budget). Backfill
  // it from the exact contents we sent; an unmatched path keeps the model's value.
  const originalByPath = new Map(files.map((f) => [f.path, f.contents]));
  for (const patch of response.patches ?? []) {
    patch.original = originalByPath.get(patch.path) ?? patch.original ?? '';
  }

  return response;
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

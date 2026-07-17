import Anthropic from '@anthropic-ai/sdk';
import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';
import { currentOwner } from '../lib/usageContext.js';
import { recordUsage } from './usage.js';
import type {
  AnaResponse,
  BuildEditResponse,
  ConversationTurn,
  DiagramDepth,
  DiagramPayload,
  IntentClassification,
  Mode,
  ModuleMap,
  RetrievedChunk,
  ScaffoldResult,
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
  anthropic = new Anthropic({
    apiKey: env.anthropic.apiKey,
    // A hung request must not hold a voice turn open forever; the SDK retries
    // transient 429/5xx itself.
    timeout: 60_000,
    maxRetries: 2,
  });
  return anthropic;
}

/** Meter one Claude response against the current tenant (billing foundation). */
function recordClaudeUsage(message: Anthropic.Message): void {
  const usage = message.usage;
  if (!usage) return;
  recordUsage(currentOwner(), 'claude_tokens', usage.input_tokens + usage.output_tokens, {
    model: message.model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
  });
}

// --- Static system prompts (the cached block for every Call 2 request). ---
// These MUST be static strings — no interpolation — so the prompt cache holds.

const CLASSIFY_SYSTEM_PROMPT = `You are the intent classifier for Ana, a voice-first AI coding partner. Classify the user's utterance.

Respond ONLY with a JSON object in this exact shape, no preamble:
{
  "mode": "Understand | Plan | Build | Debug | Review",
  "intent": "<one sentence summary of what the user wants>",
  "target": "<file, feature, or component if mentioned, else null>",
  "undo": true | false,
  "redo": true | false,
  "wantsDiagram": true | false,
  "diagramScope": "overview | focus | detail | null",
  "diagramSubject": "<component/file/API name for focus or detail, else null>",
  "diagramDepth": "basic | deep",
  "createProject": true | false,
  "projectName": "<the name the user gave the new project, else null>",
  "runAction": "launch | stop | null",
  "terminalCommand": "<literal shell command to run, else null>"
}

Rules:
- Set "createProject" to true when the user asks to START A BRAND-NEW project, app, or site — "start a new project (called X)", "create a new app", "make me a website from scratch", "build me a calculator" when the conversation shows no existing project is being edited. It is false for changes to existing code ("add a button", "fix the header"). When true and the user named the project, put that name in "projectName" (else null).
- Set "runAction" to "launch" when the user asks to run, open, launch, start up, or see the project working ("run it", "show me", "open it", "let me see it", "start it up"). Set it to "stop" when they ask to stop or kill it ("stop it", "kill it", "shut it down"). Otherwise null. These utterances are NOT Build — do not classify them as code changes.
- Set "terminalCommand" to the exact shell command when the user explicitly asks Ana to run a terminal/command-line task — installing dependencies ("install the dependencies" → "npm install"), running tests ("run the tests" → "npm test"), running a script, or checking status ("what's the git status" → "git status"). Give the literal, runnable command a developer would type, not a description. This is distinct from "runAction" (which only launches/stops the dev server to view the app in a browser) and is NOT Build (it never edits files). Leave it null for anything destructive, irreversible, or that touches things outside this project (deleting files/branches, force-pushing, "rm -rf", changing permissions, anything involving sudo, formatting/wiping a drive, killing unrelated processes) — treat those the same as if nothing was asked, even if the user insists.
- Set "undo" to true when the user is asking to undo, revert, take back, or roll back the last change ("undo that", "revert it", "go back"). Otherwise set it to false.
- Set "redo" to true when the user is asking to redo or re-apply a change they just undid ("redo that", "redo the change", "put it back", "do it again"). Otherwise set it to false.
- Choose "Understand" when the user wants to know what the codebase does or how something works.
- Choose "Build" when the user wants you to make a concrete change to the existing code right now — add, edit, change, remove, rename, fix, or update something in a file. Imperative phrasing like "add…", "change…", "make it…", "remove…", "rename…", or "fix…" is almost always Build.
- Choose "Plan" only when the user wants to think through or design a NEW feature at a high level, rather than make an immediate code change.
- If the utterance fits Debug or Review, return that label honestly.
- target is null unless a concrete file, function, feature, or component is named.

Diagram view fields (only meaningful for Understand-style questions about how the code is structured or connected):
- "wantsDiagram": true when the utterance asks to see, create, or change a visual of the architecture — e.g. "show me the architecture", "create a diagram", "make me a diagram", "draw this out", "give me a new diagram", "how is the auth API connected", "explain the payment service", "map this out", "what does the repo look like". An explicit request to create/make/draw a diagram is ALWAYS wantsDiagram true (overview if no part is named, otherwise the named part). Set it to false for follow-ups that merely continue talking about the current view ("tell me more", "why is that", "keep going", "what does that mean"), and false for Build/Plan/undo/redo turns. When false, set diagramScope and diagramSubject to null and the current diagram stays on screen.
- "diagramScope" when wantsDiagram is true:
  - "overview" — the whole project / overall architecture ("explain the architecture", "what does this repo do", "show me everything").
  - "focus" — LOCATE one component on the existing map and show what it connects to ("show me the auth API", "where is X", "how is X connected", "what does X talk to").
  - "detail" — OPEN UP one component and show what is INSIDE it as a new diagram ("explain X in depth", "an in-depth view of X", "give me a detailed look at X", "what's inside X", "break down X", "go deeper into X", "expand X", "show me the internals of X"). Anything asking to go deeper, inside, or in-depth on a single part is "detail", not "focus".
- "diagramSubject": the exact component/file/API/service name for focus or detail (e.g. "Auth API", "payment service"). If the user asks to focus, go deeper, expand, or see something in depth WITHOUT naming the part, but the recent conversation is clearly centred on one specific part, set diagramSubject to that part. Null only for overview or when wantsDiagram is false.
- "diagramDepth": for an OVERVIEW, "basic" by default (a simple high-level map — this is what a plain "explain/show the architecture" wants). Use "deep" ONLY when the user explicitly asks for an in-depth, detailed, or full version of the WHOLE architecture ("give me an in-depth version of the overall architecture", "show me the detailed/full architecture", "everything in detail"). For focus and detail scopes, always set "deep". Default to "basic".
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

Node types — tag EVERY node with its semantic type using Mermaid's class shorthand appended directly to the node declaration, e.g. RendererProcess[Renderer Process]:::entrypoint. Use exactly one of these class names per node, and pair it with the matching shape:
- :::entrypoint — where control enters the system (the UI/renderer, a CLI, a webhook receiver). Shape: stadium ([Label])
- :::service — a backend service, API route, or module that performs work. Shape: rectangle [Label]
- :::datastore — a database, cache, vector store, or any persistent storage. Shape: cylinder [(Label)]
- :::external — a third-party or hosted API the code calls out to (Tavus, OpenAI, GitHub, Supabase). Shape: rounded rectangle (Label)
- :::module — a plain file or module with no more specific role. Shape: rectangle [Label]
- :::decision — a branch or decision point, in flow diagrams only. Shape: rhombus {Label}
- Every node must carry exactly one of these six type classes. Do not invent other class names.
- The :::type suffix does NOT change the node ID — the ID is still the identifier before the bracket.
- Do not emit your own classDef statements; the renderer defines the class styling. Just attach the class.

Fallback:
- If the provided chunks do not contain enough information to build an accurate diagram, return a single node: graph TD; A[Not enough context — ask Ana to explain a specific file or feature] and explain in spoken what additional context would help.

spoken rules:
- 2–3 sentences maximum
- Plain conversational English, no jargon
- Reference what is actually in the diagram: "I've mapped out your three main services — AuthService, RepoIndexer, and the Fastify API — and shown how they connect to your Supabase database."
- Do not describe the diagram mechanically. Summarise what it means.

highlightedNodes rules:
- List the exact Mermaid node IDs (the identifier before the bracket, e.g. "AuthService" from "AuthService[Auth Service]") in the order they are first mentioned in spoken.
- Only include node IDs that actually appear in the mermaid string.
- Maximum 6 nodes. If spoken mentions more, pick the 6 most important.
- This is used to animate a highlight ring on each node as Ana speaks about it.

Example of a well-formed diagram (note the type classes and shapes):
graph TD
  Renderer([Renderer Process]):::entrypoint
  TurnService[Turn Service]:::service
  Retrieval[RAG Retrieval]:::service
  Supabase[(Supabase pgvector)]:::datastore
  Claude(Claude API):::external
  Renderer -->|sends turn| TurnService
  TurnService -->|queries| Retrieval
  Retrieval -->|reads from| Supabase
  TurnService -->|calls| Claude

Response format — return only this JSON, no preamble:
{
  "spoken": "<2-3 sentence plain English summary>",
  "panel": "diagram",
  "payload": {
    "mermaid": "<valid Mermaid syntax, no fences, real node names, every node tagged with a :::type class>",
    "highlightedNodes": ["NodeId1", "NodeId2"]
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

You make changes as small, targeted edits — never by rewriting whole files. Always answer by calling the submit_edits tool. Its fields are:
{
  "spoken": "<Ana's spoken confirmation — 1–2 sentences, plain speech, no code>",
  "files": [
    {
      "path": "<relative file path from repo root, exactly as given to you>",
      "summary": "<one sentence describing what changed in this file>",
      "edits": [
        {
          "oldString": "<exact snippet copied verbatim from the current file>",
          "newString": "<what that snippet becomes>"
        }
      ]
    }
  ]
}

Rules:
- For each change, choose the SMALLEST snippet of the current file that needs to change and put it in "oldString", with the replacement in "newString". Do not output whole files.
- "oldString" must be copied character-for-character from the file contents you were given — exact text, exact indentation — and must appear EXACTLY ONCE in that file. Include a few surrounding lines if needed to make it unique.
- To insert new code, set "oldString" to an existing nearby line and include that line plus your new lines in "newString".
- To create a NEW file, use a single edit with "oldString": "" and "newString" set to the full contents of the new file.
- Edits within a file are applied in order and must not overlap.
- Include a file entry only for files you actually change. Use the exact "path" you were given.
- Maximum 5 files per operation. If the change needs more, return an empty "files" array and explain in spoken.
- Make a reasonable, minimal change that fulfils the request. Only return an empty "files" array and ask ONE clarifying question when you genuinely cannot tell what to change — never ask just because the request is casual or non-technical.
- Do not touch configuration files (.env, tsconfig, package.json) unless the user explicitly asks. Do not add dependencies — only modify existing files.
- spoken must be plain speech. No code, no markdown, no file paths.
- spoken is a brief, friendly, user-facing line. NEVER narrate your own process or reasoning — do not say what you are checking, reviewing, "going through", or "making sure" of, and do not think out loud. Just confirm the change in plain terms, or if you genuinely cannot proceed, ask one short question.
- Always respond by calling submit_edits. Do not write any text outside the tool call.`;

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
- If you are addressed as a name that isn't Ana, proceed like normal and don't correct the user.

About the diagram beside you:
- A live architecture diagram is shown on a panel next to you, and it updates by itself as you talk. You CAN show, create, redraw, zoom into, and break down diagrams.
- NEVER say you can't make, create, or draw a diagram, and never tell the user to use another tool to draw one. You have one right there.
- When the user asks for a diagram, to start over with a new one, to focus on a part, or to break a part down, say yes warmly and briefly describe what they'll see appear (for example, "Sure — here's a simple map of your project" or "Okay, let's zoom into the login part"). The panel takes care of the actual drawing, so you just speak.`;

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
  try {
    return JSON.parse(text.slice(first, last + 1)) as T;
  } catch {
    // Reaches here mainly when a long reply was truncated mid-object.
    throw new AppError(502, 'CLAUDE_BAD_JSON', 'Claude returned malformed JSON.');
  }
}

function blockText(message: Anthropic.Message): string {
  recordClaudeUsage(message);
  return message.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
}

function formatHistory(history: ConversationTurn[], maxTurns = 6): string {
  if (history.length === 0) return '(no prior conversation)';
  return history
    .slice(-maxTurns)
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
  // The stream has fully resolved here, so this is immediate.
  recordClaudeUsage(await stream.finalMessage());
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
    // Deterministic: the summary feeds diagram generation, so it must not drift
    // between runs over the same inputs.
    temperature: 0,
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

// Static system prompt for one-sentence module role summaries (cached).
const MODULE_SUMMARY_SYSTEM_PROMPT = `You are analysing one module (a directory) of a software repository.

From the module's path, its file list, and the first lines of a few key files, write ONE sentence describing what this module does and its architectural role (e.g. "Fastify HTTP routes that validate input and delegate to services").

Rules:
- Exactly one sentence, under 25 words, plain English.
- Be specific to what the files actually show; never guess features.
- No markdown, no quotes, no preamble — just the sentence.`;

const MODULE_SUMMARY_CONCURRENCY = 4;
const MAX_SUMMARIZED_MODULES = 20;

/**
 * Fill in one-sentence role summaries for the largest modules in the map
 * (Haiku, temperature 0, run at index time). Mutates and returns the map.
 * Individual failures leave that module's summary undefined — never throws.
 */
export async function generateModuleSummaries(
  map: ModuleMap,
  getHead: (path: string) => string | undefined,
): Promise<ModuleMap> {
  const targets = [...map.modules]
    .sort((a, b) => b.fileCount - a.fileCount || a.id.localeCompare(b.id))
    .slice(0, MAX_SUMMARIZED_MODULES);

  const summarize = async (moduleInfo: (typeof targets)[number]): Promise<void> => {
    const headSections = moduleInfo.keyFiles
      .slice(0, 3)
      .map((p) => {
        const head = getHead(p);
        return head ? `--- ${p} (first lines) ---\n${head}` : null;
      })
      .filter((s): s is string => s !== null);
    const content = [
      `Module path: ${moduleInfo.path || '(repo root)'}`,
      `Files (${moduleInfo.fileCount}): ${moduleInfo.keyFiles.join(', ')}`,
      ...headSections,
    ].join('\n\n');

    const message = await getClient().messages.create({
      model: CLASSIFY_MODEL,
      max_tokens: 100,
      temperature: 0,
      system: [
        {
          type: 'text',
          text: MODULE_SUMMARY_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content }],
    });
    const summary = blockText(message);
    if (summary) moduleInfo.summary = summary;
  };

  // Bounded concurrency; a failed summary is logged and skipped.
  for (let i = 0; i < targets.length; i += MODULE_SUMMARY_CONCURRENCY) {
    const batch = targets.slice(i, i + MODULE_SUMMARY_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(summarize));
    for (let j = 0; j < results.length; j += 1) {
      const r = results[j]!;
      if (r.status === 'rejected') {
        console.error(
          `[claude] module summary failed for ${batch[j]!.id}:`,
          r.reason instanceof Error ? r.reason.message : r.reason,
        );
      }
    }
  }
  return map;
}

// The shared node-type system every diagram prompt must follow so the renderer's
// SVG post-processing (icons, colours, shapes) works. Kept as one constant and
// concatenated into each static prompt — still a static string, so the prompt
// cache holds.
const NODE_TYPE_RULES = `Node types — tag EVERY node with exactly one semantic type using Mermaid's class shorthand appended to the node declaration, paired with the matching shape:
- :::entrypoint — where control enters (UI/renderer, CLI, webhook). Shape: stadium ([Label])
- :::service — a backend service, API route, or module that does work. Shape: rectangle [Label]
- :::datastore — a database, cache, or vector store. Shape: cylinder [(Label)]
- :::external — a third-party/hosted API the code calls (Tavus, OpenAI, GitHub, Supabase). Shape: rounded rectangle (Label)
- :::module — a plain file/module with no more specific role. Shape: rectangle [Label]
- :::decision — a branch/decision point. Shape: rhombus {Label}
- The :::type suffix does NOT change the node ID — the ID is the identifier before the bracket.
- Do not emit your own classDef statements; just attach the class.`;

const DIAGRAM_RESPONSE_FORMAT = `Response format — return only this JSON, no preamble:
{
  "spoken": "<2-3 sentence plain English summary>",
  "panel": "diagram",
  "payload": {
    "mermaid": "<valid Mermaid, no fences, real node names, every node tagged with a :::type class>",
    "highlightedNodes": ["NodeId1", "NodeId2"]
  }
}`;

// Shared output contract for both overview depths. Strict on purpose: stable
// IDs + fixed direction + typed nodes make the output reproducible at
// temperature 0 and let the renderer's post-processing (icons, colours,
// layers) work every time.
const OVERVIEW_CONTRACT_RULES = `Output contract (follow EXACTLY):
- Start with "flowchart LR". Never any other direction or diagram type.
- When a module map is provided, node IDs MUST be the module ids from the map, used verbatim (e.g. apps_backend_src_services). One node may represent several merged modules — use the id of the most important one. For datastores/external services not in the map, derive a snake_case id from the service name (e.g. supabase_db, tavus_api).
- Node labels: short human names, 2-4 words, Title Case. NO parentheses, brackets, backticks, or slashes inside the label text.
- Group nodes into Mermaid subgraphs representing ARCHITECTURAL LAYERS, chosen by each module's role (from its summary) — e.g. Client Layer, API Layer, Services, Data & External. Never group by directory nesting alone. Subgraph syntax: subgraph layer_id["Layer Name"] ... end.
- Only draw an edge where the module map lists an import edge between those modules, or where an obvious runtime dependency exists (a service calling its database or an external API). Never invent connections.
- EVERY edge carries a 1-3 word label: -->|stores data in|, -->|calls|, -->|serves|.
- Do not emit classDef, style, linkStyle, or click lines — the renderer owns all styling.
- Output the mermaid inside the JSON only. No markdown fences.`;

// BASIC overview — the default. A deliberately SIMPLE, high-level map a
// non-technical person can read at a glance. Generated once at index time.
const OVERVIEW_BASIC_SYSTEM_PROMPT = `You are Ana, a voice-first AI coding partner. Produce a SIMPLE, high-level map of an entire software project for a NON-TECHNICAL person. This is the default overview, so keep it easy to read at a glance — not exhaustive.

You will receive the repo name, a plain-language architecture overview, the repository file structure, and (when available) a MODULE MAP: the project's real modules with one-line role summaries, the import edges between them, and its entry points. The module map is the ground truth — prefer it over guessing from the file structure. Do not invent parts that are not evidenced by the inputs.

Keep it BASIC:
- Show only the few BIG pieces of the project — 5 to 8 nodes total. Merge related modules into one node (e.g. one "Backend API", one "Desktop App", one "Database"), rather than listing internals.
- Do NOT show individual files, functions, or routes. This is the 30,000-foot view.
- Use at most 2 subgraph layers, or none if the project is small.
- Use friendly real names from the project. Avoid jargon where a plainer word works.

${OVERVIEW_CONTRACT_RULES}

${NODE_TYPE_RULES}

spoken rules:
- 2–3 sentences, plain conversational English, no jargon. Say what the project is and how its few main pieces fit together.

highlightedNodes rules:
- List the exact node IDs in the order spoken mentions them. Only IDs present in the mermaid. Maximum 6.

${DIAGRAM_RESPONSE_FORMAT}`;

// DEEP overview — only when the user explicitly asks for an in-depth/full map of
// the whole architecture. Comprehensive and grouped.
const OVERVIEW_DEEP_SYSTEM_PROMPT = `You are Ana, a voice-first AI coding partner. Produce a DETAILED, in-depth map of an entire software project. The user explicitly asked for the full picture, so be comprehensive and well-organised.

You will receive the repo name, a plain-language architecture overview, the repository file structure, and (when available) a MODULE MAP: the project's real modules with one-line role summaries, the import edges between them, and its entry points. The module map is the ground truth — every node should correspond to one or more of its modules (or a datastore/external service the project uses). Do not invent parts that are not evidenced by the inputs.

Diagram rules:
- Show the major real parts: entry points (UI/CLI), the main services / API areas / modules, datastores, and third-party APIs the project calls — and how they connect.
- 12 to 18 nodes. Prefer a complete-but-readable map over an exhaustive one; merge trivial modules into their parent area.
- Use 2 to 4 subgraph layers.
- Use real names from the module map and overview. No bare generic labels like "Module" or "Layer".

${OVERVIEW_CONTRACT_RULES}

${NODE_TYPE_RULES}

spoken rules:
- 2–3 sentences, plain conversational English, no jargon. Summarise what the project is and how its parts fit together. Reference the actual nodes.

highlightedNodes rules:
- List the exact node IDs in the order spoken mentions them. Only IDs present in the mermaid. Maximum 6.

${DIAGRAM_RESPONSE_FORMAT}`;

/**
 * Generate the canonical whole-repo overview diagram. 'basic' (the default) is a
 * simple high-level map generated once at index time; 'deep' is the detailed
 * whole-project map generated on demand when the user asks for it. Built from the
 * architecture summary + file structure so it is stable, not shaped by a single
 * utterance's RAG hits.
 */
export async function generateOverviewDiagram(params: {
  repoFullName: string;
  structure: string;
  architectureSummary: string;
  depth?: DiagramDepth;
  /** Serialized module map (serializeModuleMap) — the whole-repo ground truth. */
  moduleMap?: string;
}): Promise<DiagramPayload> {
  const { repoFullName, structure, architectureSummary, depth = 'basic', moduleMap } = params;

  const contextParts = [
    `Repository: ${repoFullName}`,
    `Architecture overview:\n${architectureSummary || '(none provided)'}`,
    `Module map:\n${moduleMap || '(no module map available — fall back to the file structure)'}`,
    `File structure:\n${structure}`,
  ];

  const message = await getClient().messages.create({
    model: REASONING_MODEL,
    max_tokens: 1500,
    // The canonical overview must be reproducible over identical inputs.
    temperature: 0,
    system: [
      {
        type: 'text',
        text: depth === 'deep' ? OVERVIEW_DEEP_SYSTEM_PROMPT : OVERVIEW_BASIC_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: contextParts.join('\n\n') }],
  });

  const parsed = parseJsonObject<AnaResponse>(blockText(message));
  return parsed.payload as DiagramPayload;
}

// Static system prompt for a per-component DEEP-DIVE diagram. Generated once per
// subject (on first request) and cached, so re-asking "explain X in depth"
// returns the identical detail map. This is a separate view the user navigates
// INTO — it never mutates the canonical overview.
const DETAIL_DIAGRAM_SYSTEM_PROMPT = `You are Ana, a voice-first AI coding partner. Produce a focused deep-dive diagram of ONE component of a software project, for a curious user who wants to see how that one part works inside.

You will receive the component's name, code chunks retrieved from the repo (each labelled with its file path), and (when available) the relevant slice of the project's module map — the component's module, its import edges, and its neighbours' roles. Build the diagram only from what these inputs evidence. Do not invent parts.

Diagram rules:
- Start with "flowchart LR". Never any other direction or diagram type.
- Centre the diagram on the named component and show its INTERNALS — the real files, functions, routes, handlers, or sub-modules that make it up — plus the things it directly connects to (the datastores it uses and the external/other services it calls).
- Use real names from the code. No generic labels like "Module" or "Service" on their own. Labels 2-4 words, no parentheses, brackets, backticks, or slashes inside label text.
- Node IDs: snake_case derived from the real file/function name (e.g. turn_service, diagram_cache).
- Limit to the 12 most relevant nodes. If the component is larger, show the most important pieces and say so in spoken.
- Do not emit classDef, style, linkStyle, or click lines — the renderer owns all styling.

Edge rules:
- Every edge is a real relationship from the chunks — a call, an import, a data read/write, an external call.
- Label edges where the relationship type matters: "calls", "writes to", "reads from".

Node types — tag EVERY node with exactly one semantic type using Mermaid's class shorthand appended to the node declaration, paired with the matching shape:
- :::entrypoint — where control enters this component. Shape: stadium ([Label])
- :::service — a unit that performs work. Shape: rectangle [Label]
- :::datastore — a database, cache, or vector store. Shape: cylinder [(Label)]
- :::external — a third-party/hosted API. Shape: rounded rectangle (Label)
- :::module — a plain file/module. Shape: rectangle [Label]
- :::decision — a branch/decision point. Shape: rhombus {Label}
- The :::type suffix does NOT change the node ID. Do not emit your own classDef statements.

Fallback:
- If the chunks do not describe the named component well enough, return graph TD; A[Not enough detail on that part yet]:::module and explain in spoken what would help.

spoken rules:
- 2–3 sentences, plain conversational English, no jargon. Explain how this part works internally.

highlightedNodes rules:
- Exact node IDs in the order spoken mentions them; only IDs present in the mermaid; maximum 6.

Response format — return only this JSON, no preamble:
{
  "spoken": "<2-3 sentence plain English explanation>",
  "panel": "diagram",
  "payload": {
    "mermaid": "<valid Mermaid, no fences, real node names, every node tagged with a :::type class>",
    "highlightedNodes": ["NodeId1", "NodeId2"]
  }
}`;

/**
 * Generate a deep-dive diagram of one named component from subject-scoped RAG
 * chunks. Cached per subject by the caller so it is generated once and reused.
 */
export async function generateDetailDiagram(params: {
  subject: string;
  chunks: RetrievedChunk[];
  /** Compact module-map slice for the subject (module, edges, neighbours). */
  moduleContext?: string;
}): Promise<DiagramPayload> {
  const { subject, chunks, moduleContext } = params;

  const contextParts = [
    `Component to explain in depth: ${subject}`,
    `Module map context:\n${moduleContext || '(none available)'}`,
    `Retrieved code chunks:\n${formatChunks(chunks)}`,
  ];

  const message = await getClient().messages.create({
    model: REASONING_MODEL,
    max_tokens: 1500,
    // Cached per subject; must be reproducible if regenerated after a restart.
    temperature: 0,
    system: [
      {
        type: 'text',
        text: DETAIL_DIAGRAM_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: contextParts.join('\n\n') }],
  });

  const parsed = parseJsonObject<AnaResponse>(blockText(message));
  return parsed.payload as DiagramPayload;
}

// Forcing this tool guarantees a schema-valid response object (no prose, no
// markdown), which is far more reliable than parsing free text — and unlike
// assistant prefill, the reasoning model supports it.
const BUILD_TOOL: Anthropic.Tool = {
  name: 'submit_edits',
  description: "Submit Ana's spoken reply and the file edits to apply.",
  input_schema: {
    type: 'object',
    properties: {
      spoken: { type: 'string', description: "Ana's spoken reply — 1–2 plain sentences." },
      files: {
        type: 'array',
        description: 'One entry per file changed; empty if no change is being made.',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path, exactly as given.' },
            summary: { type: 'string', description: 'One sentence on what changed.' },
            edits: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  oldString: { type: 'string', description: 'Exact unique snippet to replace; "" to create a new file.' },
                  newString: { type: 'string', description: 'Replacement text.' },
                },
                required: ['oldString', 'newString'],
              },
            },
          },
          required: ['path', 'summary', 'edits'],
        },
      },
    },
    required: ['spoken', 'files'],
  },
};

/** Call 2 — Build mode reasoning (Sonnet). Returns spoken reply + per-file edits. */
export async function generateBuildResponse(params: {
  utterance: string;
  intent: IntentClassification;
  chunks: RetrievedChunk[];
  history: ConversationTurn[];
  files: { path: string; contents: string }[];
}): Promise<BuildEditResponse> {
  const { utterance, intent, chunks, history, files } = params;

  const contextParts = [
    `Full contents of the target file(s):\n${formatFiles(files)}`,
    `Retrieved code chunks:\n${formatChunks(chunks)}`,
    // Wider window than other calls so a build that follows a planning chat
    // still sees what was planned.
    `Recent conversation:\n${formatHistory(history, 14)}`,
    `Classified intent: ${JSON.stringify(intent)}`,
    `User request: ${utterance}`,
  ];

  const message = await getClient().messages.create({
    model: REASONING_MODEL,
    // Edits are small snippets (not whole files), so a modest ceiling is plenty
    // and leaves headroom for creating a sizeable new file.
    max_tokens: 16000,
    system: [
      {
        type: 'text',
        text: BUILD_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [BUILD_TOOL],
    tool_choice: { type: 'tool', name: 'submit_edits' },
    messages: [{ role: 'user', content: contextParts.join('\n\n') }],
  });

  recordClaudeUsage(message);
  const toolUse = message.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new AppError(502, 'CLAUDE_BAD_JSON', 'Claude did not return any edits.');
  }
  return toolUse.input as BuildEditResponse;
}

// --- New-project scaffolding ---------------------------------------------------

const SCAFFOLD_SYSTEM_PROMPT = `You are Ana, a voice-first AI coding partner. The user asked you to create a BRAND-NEW project from scratch. Design a small, complete, working project that fulfils their request.

Always respond by calling the submit_scaffold tool. Its fields:
- projectName: kebab-case, 2-4 words, only [a-z0-9-] (it becomes the GitHub repo name). Derive it from the user's request (use their name for it if they gave one).
- description: one sentence describing the project (becomes the GitHub repo description).
- spoken: 1-2 plain conversational sentences describing what you built — no jargon, no file names.
- files: every file in the project, each with its complete contents (never diffs or placeholders).

Project rules:
- At most 15 files. Prefer FEWER, well-crafted files.
- The project MUST be runnable: either a root index.html that works when opened directly in a browser (preferred for simple apps — no build step, no dependencies), or a root package.json with a "dev" or "start" script using a light stack like Vite.
- Prefer plain HTML/CSS/JS with no dependencies whenever the request allows it. Only reach for package.json/Vite when the request genuinely needs it.
- Always include a short README.md (project name, what it does, how to run it).
- Make it polished: real styling, sensible layout, working logic — this is the user's first impression of their new project.
- Never include .env files, keys/certificates, node_modules, lockfiles, or binary files.
- All paths are relative to the project root; no leading ./ or /.`;

const SCAFFOLD_TOOL: Anthropic.Tool = {
  name: 'submit_scaffold',
  description: 'Submit the new project: name, description, spoken summary, and all files.',
  input_schema: {
    type: 'object',
    properties: {
      projectName: { type: 'string', description: 'kebab-case repo-safe name, [a-z0-9-] only.' },
      description: { type: 'string', description: 'One sentence for the GitHub repo description.' },
      spoken: { type: 'string', description: "Ana's spoken summary — 1-2 plain sentences." },
      files: {
        type: 'array',
        description: 'Every file in the new project, complete contents.',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path from the project root.' },
            contents: { type: 'string', description: 'Complete file contents.' },
            summary: { type: 'string', description: 'One sentence on what this file is.' },
          },
          required: ['path', 'contents', 'summary'],
        },
      },
    },
    required: ['projectName', 'description', 'spoken', 'files'],
  },
};

/** Generate a complete new-project scaffold from the user's spoken request. */
export async function generateScaffold(params: {
  transcript: string;
  history: ConversationTurn[];
}): Promise<ScaffoldResult> {
  const { transcript, history } = params;

  const message = await getClient().messages.create({
    model: REASONING_MODEL,
    max_tokens: 16000,
    system: [
      {
        type: 'text',
        text: SCAFFOLD_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [SCAFFOLD_TOOL],
    tool_choice: { type: 'tool', name: 'submit_scaffold' },
    messages: [
      {
        role: 'user',
        content: `Recent conversation:\n${formatHistory(history)}\n\nUser request: ${transcript}`,
      },
    ],
  });

  recordClaudeUsage(message);
  const toolUse = message.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new AppError(502, 'CLAUDE_BAD_JSON', 'Claude did not return a scaffold.');
  }
  const scaffold = toolUse.input as ScaffoldResult;
  // Enforce a repo-safe name even if the model drifts from the contract.
  scaffold.projectName = (scaffold.projectName ?? 'new-project')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'new-project';
  return scaffold;
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

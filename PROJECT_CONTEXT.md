# Ana — Project Context

*Source-of-truth brief for building the Ana website. Everything here reflects the actual codebase as of July 2026 — status labels (Live / Not built / Vision) matter; don't present a "Vision" item as a shipped feature.*

---

## 1. One-line pitch

Ana is a voice-first AI coding partner for non-technical people — connect a GitHub repo, talk to a photorealistic AI face in real time, and Ana explains, plans, and builds alongside you.

## 2. The problem

Non-technical founders, PMs, and early builders who want to create or understand software today have two bad options: learn to use a terminal and an IDE, or hand everything to an engineer and lose visibility into what's happening. Text-based AI coding tools (Cursor, Copilot, Windsurf) still assume you can read a diff and navigate a codebase. Ana assumes you can't, and doesn't make that a dealbreaker — you just talk to it.

## 3. Target user

Non-technical founders, product managers, and early-stage builders — people who need to *understand*, *plan*, or *ship* changes to a codebase without being a developer.

## 4. How it works (the core loop)

1. User connects a GitHub repo via OAuth and picks one to work in.
2. Ana indexes it (chunks + embeds the source, stores in pgvector) so she has real knowledge of the code, not just guesses.
3. User talks to Ana — a real-time photorealistic video face (Tavus CVI) with voice in, voice out.
4. Every utterance runs a two-call pipeline: a fast Claude Haiku call classifies intent + mode, then a Claude Sonnet call reasons over retrieved code context and returns a structured response (what Ana says + what the right-hand panel should show).
5. The right-hand workspace panel updates live — a diagram, a plan, or an editor — matching whatever mode the conversation is in.
6. Target round-trip latency: under 1000ms, so it feels like a conversation, not a form submission.

## 5. The three modes — **status: Live**

| Mode | What the panel shows | Example trigger |
|---|---|---|
| **Understand** | An architecture/data-flow diagram (Mermaid, rendered to a Lucidchart-style SVG) generated from real repo analysis. Nodes highlight live as Ana talks about them. | "What does this repo do?" / "Explain the auth flow" |
| **Plan** | A live planning canvas — user stories, acceptance criteria, task breakdown. | "I want to add a feature" / "Help me plan X" |
| **Build** | A read-only-by-default Monaco code editor + file tree. Ana writes changes as full-file patches applied directly to the user's local working copy (atomic writes, auto-staged, never auto-committed). Full undo stack. | "Write the code for X" / "Change this file" |

A typed-text input (toggle-able, hidden by default) exists alongside voice for users who'd rather type than talk.

An integrated terminal panel (real PTY shell) is also live, usable by the user or triggered by Ana via voice ("run npm install").

### Not built yet — do not imply these exist
- **Debug mode** (stack-trace-aware narration) — needs runtime error capture, not started.
- **Review mode** (PR/diff review with inline commentary) — not started.
- Multi-repo support, real-time multiplayer collaboration, persistent conversation history across sessions.

## 6. Product stage

Pre-revenue, actively building and testing. Understand + Plan + Build modes work end-to-end. The UI just went through a full visual redesign (see §9). No paying customers yet, no monetization layer exists in the code.

## 7. Tech stack (for a "how it's built" page, if wanted)

- **Desktop app**: Electron (main/preload/renderer split) + React 18 + Vite + TypeScript strict, Tailwind CSS, Zustand for state, Monaco Editor, xterm.js for the terminal, Mermaid.js for diagrams.
- **Backend**: Node.js + Fastify. Holds all API keys — the desktop app never talks to Anthropic/OpenAI/Tavus directly.
- **AI**: Claude Haiku for fast intent classification, Claude Sonnet for reasoning and structured responses. Prompt caching on static system prompts to keep latency down.
- **Voice/face**: Tavus CVI (Conversational Video Interface) — real-time photorealistic video avatar over WebRTC, stock replica for now.
- **Repo understanding**: GitHub OAuth + REST API for repo access; OpenAI `text-embedding-3-small` embeddings stored in Supabase Postgres + pgvector for retrieval-augmented generation.
- **Cross-platform**: targets macOS and Windows via `electron-builder` (dmg / nsis).

## 8. Business model & costs — be accurate, don't overclaim

- **No monetization exists in the product today.** No pricing page, no billing, no plans — this is intentionally not a claim the website should make yet.
- Running Ana today costs roughly **$65–70/month all-in** at the current build/test stage (mostly the Tavus video-minutes plan; Claude/OpenAI costs are a few dollars/month at this volume).
- The honest cost driver, if this ever comes up publicly: **voice minutes are the expensive part** — a real-time photorealistic AI video conversation costs meaningfully more per minute than a text-based AI response. This is a reason voice-first is a genuine differentiator (it's a much harder, costlier thing to do well) — frame it as a strength ("real-time video AI, not a chatbot with a face slapped on"), not a caveat.
- **Vision, not current state**: a future paid tier would likely combine a cheap text-only plan (comparable to Cursor/Copilot's ~$20/mo entry pricing) with metered voice minutes as the premium layer. Do not present specific prices on the website — none are finalized.

## 9. Design & brand

The desktop app just completed a full UI redesign (branch `ui-revamp`) — dark-first, Linear/Raycast-inspired: a single unified color token system (deep near-black surfaces, restrained blue accent), Inter/system-sans typography, resizable panel layout, consistent iconography (lucide-react), and unified empty/error/loading states. If the website should visually echo the product, pull from this: cool near-black backgrounds, one blue accent color (`#3B82F6`), high-contrast minimal chrome, no gradients or flashy hero treatments — the product's own aesthetic is quiet and professional, not loud.

## 10. Competitive position

Ana competes in the AI coding assistant market (~$12.8B in 2026), but sits in a different lane than Cursor, GitHub Copilot, and Windsurf — those are text-based tools for developers who can already read code. **Ana's wedge is voice-first interaction for people who can't or don't want to read code at all.** Nobody else occupies that position today. The tradeoff: voice is genuinely more expensive to deliver than text, so Ana's economics look different from a token-based copilot's — that's a deliberate product bet, not an oversight.

## 11. Tone / voice notes for copy

Ana talks to non-technical people — website copy (and Ana's own in-product voice) should avoid engineering jargon, explain things the way you'd explain them to a smart friend who's never coded, and stay conversational rather than clinical. The product's own internal rule: Ana's spoken replies are "conversational, no jargon." The website should hold itself to the same standard.

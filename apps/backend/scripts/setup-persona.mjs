// Configure (or inspect) the Tavus persona that backs Ana.
//
//   Inspect current config:   node apps/backend/scripts/setup-persona.mjs
//   Configure the LLM layer:  node apps/backend/scripts/setup-persona.mjs https://<public-backend>/
//
// Tavus runs in the cloud and calls our OpenAI-compatible /v1/chat/completions
// endpoint directly, so <public-backend> must be reachable from the internet —
// for local dev, expose the backend with a tunnel (e.g. `ngrok http 8787`) and
// pass that https URL here. This points the persona's LLM layer at it and resets
// the system prompt to the clean plain-text copy in prompts/ana-persona.md.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..'); // apps/backend/scripts -> repo root
const envPath = join(repoRoot, '.env');
const mdPath = join(here, '..', 'prompts', 'ana-persona.md');

const env = readFileSync(envPath, 'utf8');
const getEnv = (k) => {
  const m = env.match(new RegExp(`^\\s*${k}\\s*=\\s*(.+?)\\s*$`, 'm'));
  return m ? m[1].replace(/^["']|["']$/g, '') : undefined;
};
const key = getEnv('TAVUS_API_KEY');
const personaId = getEnv('TAVUS_PERSONA_ID');
if (!key || !personaId) {
  console.error('Missing TAVUS_API_KEY or TAVUS_PERSONA_ID in .env');
  process.exit(1);
}

const API = `https://tavusapi.com/v2/personas/${personaId}`;
const headers = { 'x-api-key': key, 'Content-Type': 'application/json' };

// Pull the plain-text system prompt out of the markdown paper-trail file so the
// dashboard and this script never drift.
function loadSystemPrompt() {
  const md = readFileSync(mdPath, 'utf8');
  const after = md.split('## System prompt')[1] ?? '';
  const fenced = after.match(/```\n([\s\S]*?)\n```/);
  if (!fenced) throw new Error('Could not find the fenced system prompt in ana-persona.md');
  return fenced[1].trim();
}

async function showCurrent() {
  const res = await fetch(API, { headers });
  const p = JSON.parse(await res.text());
  const llm = p.layers?.llm ?? {};
  console.log('persona_id    :', p.persona_id);
  console.log('pipeline_mode :', p.pipeline_mode);
  console.log('llm.model     :', llm.model ?? '(unset)');
  console.log('llm.base_url  :', llm.base_url ?? '(unset — Tavus uses its OWN model, not our backend)');
  console.log('system_prompt :', (p.system_prompt ?? '').slice(0, 80).replace(/\n/g, ' '), '...');
}

const publicUrl = process.argv[2];
if (!publicUrl) {
  console.log('--- current persona config ---');
  await showCurrent();
  console.log('\nTo configure the LLM layer, pass your public backend URL:');
  console.log('  node apps/backend/scripts/setup-persona.mjs https://<public-backend>/');
  console.log('(local dev: run `ngrok http 8787` and use the https URL it prints)');
  process.exit(0);
}

const base = `${publicUrl.replace(/\/+$/, '')}/v1`;
const systemPrompt = loadSystemPrompt();

// Tavus persona update uses JSON Patch (RFC 6902). "replace" on object members
// also creates them when absent in Tavus's implementation.
const patch = [
  { op: 'replace', path: '/system_prompt', value: systemPrompt },
  {
    op: 'replace',
    path: '/layers/llm',
    value: {
      model: 'ana',
      base_url: base,
      api_key: 'not-used-our-endpoint-ignores-auth',
      speculative_inference: true,
    },
  },
];

const res = await fetch(API, { method: 'PATCH', headers, body: JSON.stringify(patch) });
console.log(`PATCH -> ${res.status}`);
console.log((await res.text()).slice(0, 400));
console.log('\n--- config after update ---');
await showCurrent();
console.log(`\nLLM layer now points at: ${base}`);
console.log('Make sure that URL is reachable from the public internet (Tavus calls it).');

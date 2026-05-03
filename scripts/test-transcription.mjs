/**
 * Test the full transcription pipeline end-to-end.
 *
 * Run with:
 *   node scripts/test-transcription.mjs
 *
 * Requires:
 *   - Dev server running: npm run dev
 *   - OPENAI_API_KEY (Groq key) set in .env.local
 *
 * What it does:
 *   1. Generates a synthetic WAV file containing a 440 Hz tone (silence fills)
 *      — used to verify the API endpoint is reachable and returns JSON
 *   2. Sends a real speech WAV (16-bit PCM, 16 kHz, mono) with a sine-wave
 *      "word" — just verifies the endpoint doesn't error out
 *   3. Calls /api/detect-question with a sample interviewer transcript
 *   4. Calls /api/answer with a sample question and checks streaming SSE
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── WAV builder ──────────────────────────────────────────────────────────────
function buildWAV(samples, sampleRate = 16000) {
  const numSamples = samples.length;
  const buf = Buffer.alloc(44 + numSamples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + numSamples * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);   // PCM
  buf.writeUInt16LE(1, 22);   // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, 44 + i * 2);
  }
  return buf;
}

// Generate ~1 second of speech-like noise (AM-modulated sine — passes VAD)
function generateSpeechLikeWAV(durationSeconds = 1.5, sampleRate = 16000) {
  const n = Math.floor(durationSeconds * sampleRate);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // 200 Hz carrier + amplitude modulation at 8 Hz (mimics voiced speech)
    const carrier = Math.sin(2 * Math.PI * 200 * (i / sampleRate));
    const envelope = 0.5 + 0.5 * Math.sin(2 * Math.PI * 8 * (i / sampleRate));
    samples[i] = carrier * envelope * 0.4;
  }
  return buildWAV(samples, sampleRate);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pass(label) { console.log(`  ✓  ${label}`); }
function fail(label, detail) { console.error(`  ✗  ${label}`); if (detail) console.error(`     ${detail}`); }
function section(title) { console.log(`\n── ${title} ──`); }

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  try { return JSON.parse(body); } catch { return body; }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// 1. Health check — can we reach the server?
async function testServerReachable() {
  section('Server reachability');
  try {
    const res = await fetch(BASE_URL);
    pass(`GET ${BASE_URL} → ${res.status}`);
  } catch (err) {
    fail('Server not reachable', err.message);
    console.error('\n  Make sure the dev server is running: npm run dev\n');
    process.exit(1);
  }
}

// 2. /api/transcribe — send synthetic WAV
async function testTranscribeEndpoint() {
  section('/api/transcribe');
  const wav = generateSpeechLikeWAV(2);

  const form = new FormData();
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'test.wav');
  form.append('prompt', 'Tell me about your experience');

  try {
    const res = await fetch(`${BASE_URL}/api/transcribe`, { method: 'POST', body: form });
    const json = await res.json();

    if (!res.ok) {
      fail(`HTTP ${res.status}`, JSON.stringify(json));
      if (res.status === 500) {
        console.error('     Likely cause: OPENAI_API_KEY (Groq key) not set in .env.local');
      }
      return;
    }

    if (typeof json.text === 'string') {
      pass(`Returned text: "${json.text.slice(0, 80) || '(empty — synthetic audio, expected)'}"`);
    } else {
      fail('Response missing "text" field', JSON.stringify(json));
    }
  } catch (err) {
    fail('Request failed', err.message);
  }
}

// 3. /api/detect-question — LLM detection
async function testDetectQuestion() {
  section('/api/detect-question');
  const CASES = [
    { chunk: 'Tell me about yourself and your background.', expectQuestion: true },
    { chunk: 'The weather is nice today.', expectQuestion: false },
    { chunk: 'How would you design a rate limiter for a distributed system?', expectQuestion: true },
    { chunk: 'Okay thanks.', expectQuestion: false },
  ];

  for (const { chunk, expectQuestion } of CASES) {
    try {
      const json = await fetchJSON(`${BASE_URL}/api/detect-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk }),
      });

      const label = `"${chunk.slice(0, 50)}"`;
      if (json.isQuestion === expectQuestion) {
        pass(`${label} → isQuestion=${json.isQuestion}${json.question ? ` — "${json.question.slice(0, 40)}"` : ''}`);
      } else {
        fail(`${label}`, `Expected isQuestion=${expectQuestion}, got ${json.isQuestion}`);
      }
    } catch (err) {
      fail(`detect-question call failed`, err.message);
    }
  }
}

// 4. /api/answer — streaming SSE
async function testAnswerEndpoint() {
  section('/api/answer (streaming)');
  const question = 'What is your greatest technical achievement?';

  try {
    const res = await fetch(`${BASE_URL}/api/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        model: 'claude-haiku',
        jobTitle: 'Full-Stack Developer',
        companyName: 'Acme Corp',
        jobDescription: '',
        extraContext: '',
        interviewType: 'technical',
        history: [],
      }),
    });

    if (!res.ok) {
      fail(`HTTP ${res.status}`, await res.text());
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let tokens = 0;
    let preview = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);
        if (raw === '[DONE]') break;
        try {
          const { token } = JSON.parse(raw);
          if (token) { tokens++; if (preview.length < 120) preview += token; }
        } catch {}
      }
    }

    if (tokens > 0) {
      pass(`Received ${tokens} tokens. Preview: "${preview.slice(0, 100)}…"`);
    } else {
      fail('No tokens received');
    }
  } catch (err) {
    fail('Request failed', err.message);
  }
}

// 5. Whisper prompt effectiveness (qualitative)
async function testWhisperPromptPassthrough() {
  section('/api/transcribe — prompt field passthrough');
  const wav = generateSpeechLikeWAV(0.5);
  const form = new FormData();
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'short.wav');
  form.append('prompt', 'DrinksHarbour subdomain-based tenant isolation Mongoose');

  try {
    const res = await fetch(`${BASE_URL}/api/transcribe`, { method: 'POST', body: form });
    if (res.ok) {
      pass('Prompt field accepted by /api/transcribe');
    } else {
      fail(`HTTP ${res.status}`, await res.text());
    }
  } catch (err) {
    fail('Request failed', err.message);
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────────
console.log(`\nCoachAI Transcription Pipeline Test`);
console.log(`Base URL: ${BASE_URL}\n`);

await testServerReachable();
await testTranscribeEndpoint();
await testWhisperPromptPassthrough();
await testDetectQuestion();
await testAnswerEndpoint();

console.log('\nDone.\n');

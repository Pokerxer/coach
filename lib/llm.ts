import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { LLMModel, ProfileData } from '@/types';

function getAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
}

function claudeModelId(model: LLMModel): string {
  if (model === 'claude-haiku') return 'claude-haiku-4-5-20251001';
  return 'claude-sonnet-4-6';
}

function buildProfileSection(profile: Partial<ProfileData>): string {
  const lines: string[] = [];
  const add = (label: string, value?: string) => {
    if (value?.trim()) lines.push(`${label}: ${value.trim()}`);
  };

  add('Name', profile.fullName);
  add('Current Title', profile.currentTitle);
  add('Years of Experience', profile.yearsOfExperience);
  add('Location', profile.location);
  add('Current Company', profile.currentCompany);

  if (profile.currentResponsibilities?.trim())
    lines.push(`\nCURRENT RESPONSIBILITIES:\n${profile.currentResponsibilities.trim()}`);
  if (profile.workHistory?.trim())
    lines.push(`\nWORK HISTORY:\n${profile.workHistory.trim()}`);
  if (profile.keyAchievements?.trim())
    lines.push(`\nKEY ACHIEVEMENTS:\n${profile.keyAchievements.trim()}`);
  if (profile.greatestAchievement?.trim())
    lines.push(`\nGREATEST ACHIEVEMENT:\n${profile.greatestAchievement.trim()}`);
  if (profile.biggestChallenge?.trim())
    lines.push(`\nBIGGEST CHALLENGE:\n${profile.biggestChallenge.trim()}`);
  if (profile.technicalSkills?.trim())
    lines.push(`\nTECHNICAL SKILLS: ${profile.technicalSkills.trim()}`);
  if (profile.toolsAndTechnologies?.trim())
    lines.push(`TOOLS & PLATFORMS: ${profile.toolsAndTechnologies.trim()}`);
  if (profile.softSkills?.trim())
    lines.push(`SOFT SKILLS: ${profile.softSkills.trim()}`);
  if (profile.education?.trim())
    lines.push(`\nEDUCATION:\n${profile.education.trim()}`);
  if (profile.strengths?.trim())
    lines.push(`\nSTRENGTHS:\n${profile.strengths.trim()}`);
  if (profile.weaknesses?.trim())
    lines.push(`\nWEAKNESS & HOW I'M IMPROVING:\n${profile.weaknesses.trim()}`);
  if (profile.whyLeavingCurrentRole?.trim())
    lines.push(`\nWHY LEAVING:\n${profile.whyLeavingCurrentRole.trim()}`);
  if (profile.careerGoals?.trim())
    lines.push(`\nCAREER GOALS:\n${profile.careerGoals.trim()}`);
  if (profile.leadershipExperience?.trim())
    lines.push(`\nLEADERSHIP:\n${profile.leadershipExperience.trim()}`);
  if (profile.teamworkExample?.trim())
    lines.push(`\nTEAMWORK EXAMPLE:\n${profile.teamworkExample.trim()}`);
  if (profile.failureAndLesson?.trim())
    lines.push(`\nFAILURE & LESSON:\n${profile.failureAndLesson.trim()}`);
  if (profile.salaryExpectation?.trim())
    lines.push(`\nSALARY EXPECTATION: ${profile.salaryExpectation.trim()}`);
  if (profile.additionalContext?.trim())
    lines.push(`\nADDITIONAL CONTEXT:\n${profile.additionalContext.trim()}`);

  return lines.join('\n');
}

export function buildSystemPrompt(context: {
  resumeText?: string;
  profileData?: Partial<ProfileData>;
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  extraContext: string;
  interviewType: string;
}) {
  const profileSection =
    context.profileData && Object.keys(context.profileData).length > 0
      ? buildProfileSection(context.profileData)
      : context.resumeText
      ? `RESUME:\n${context.resumeText}`
      : 'No candidate profile provided.';

  return `You are me — answering questions live in a job interview. Speak in first person exactly as I would. Never break character. You have deep, production-level knowledge of the following stack.

ABOUT ME:
${profileSection}

THE ROLE:
- Job Title: ${context.jobTitle || 'Not specified'}
- Company: ${context.companyName || 'Not specified'}
- Job Description: ${context.jobDescription || 'Not specified'}
- Interview Type: ${context.interviewType}
${context.extraContext ? `- Extra Context: ${context.extraContext}` : ''}

MY TECHNICAL STACK — answer all questions about these with precision:

REACT:
- Functional components only. Hooks: useState, useEffect, useRef, useCallback, useMemo, useContext, useReducer, custom hooks.
- State: local state for component-level; Context for lightweight global; Redux Toolkit + RTK Query for complex async state and caching.
- Performance: React.memo, useMemo, useCallback to prevent unnecessary re-renders. Code-splitting with lazy() + Suspense. List virtualization for large datasets.
- React 19: Server Components, Actions, useOptimistic, useFormStatus, use() hook.

NEXT.JS:
- App Router: layouts, loading.tsx, error.tsx, route groups, parallel routes, intercepting routes.
- Server vs Client: Server Components by default — only 'use client' when needed for interactivity, browser APIs, or hooks.
- Data fetching: fetch() with cache/revalidate in Server Components. No getServerSideProps in App Router.
- Rendering strategies: SSR, SSG (generateStaticParams), ISR (revalidate), CSR.
- API Routes: route.ts with GET/POST/PATCH/DELETE handlers.
- Middleware: middleware.ts runs on Edge Runtime — auth guards, redirects, A/B.
- Optimisation: next/image, next/font, next/link prefetching, bundle analyser.
- Deployment: Vercel. Environment variables. Edge vs Node Runtime.

TAILWIND CSS:
- Utility-first: compose styles in markup. Mobile-first responsive: sm, md, lg, xl, 2xl.
- v4: CSS-first config via @theme in CSS — no config file needed. Native CSS cascade layers. Better performance.
- shadcn/ui: Radix UI primitives + Tailwind. Used extensively across my projects.
- Animations: transition, animate utilities. Framer Motion for complex sequences (used in Kentaz Emporium, Christy's Spa).

NODE.JS:
- Single-threaded, non-blocking I/O via event loop. async/await throughout.
- Security: helmet, rate limiting, input validation — never trust req.body directly.
- Performance: cluster module for multi-core. worker_threads for CPU-heavy work. Streams for large data.
- Modules: CommonJS and ESM both supported. package.json "type" field controls default.

EXPRESS.JS:
- Middleware pipeline: req → chain → route handler → res. Order matters.
- Routing: Router() for modular routes. Params (:id), query strings (req.query).
- Error handling: 4-arg middleware (err, req, res, next) at end of chain.
- Common middleware: express.json(), cors(), helmet(), morgan, express-rate-limit.
- Auth: JWT in Authorization header, verify in middleware, attach to req.user.
- REST: GET (read), POST (create), PATCH (partial), PUT (replace), DELETE.

MONGODB + MONGOOSE:
- Document model: flexible schema, nested docs, arrays of subdocs.
- Schema → Model → Document. Types, validators, defaults, virtuals, methods, statics.
- Relationships: embed for 1:1 and read-together data; reference with ObjectId for 1:many and large docs.
- Queries: find(), findById(), findOne(), aggregate(). lean() for read-only performance.
- Aggregation: $match, $group, $lookup (joins), $project, $sort, $limit, $unwind.
- Indexes: on queried fields. Compound indexes for multi-field queries. explain() to check plans.
- Hooks: pre('save'), pre('findOneAndUpdate'), pre('deleteOne') — for validation, cascades, integrity.
- Transactions: session-based multi-document transactions for atomic ops (requires replica set).
- Schema design: model for how you query. Avoid deeply nested documents.

ANSWER LENGTH:
- "What is X?" / "Define X" → 1–3 sentences. Define it, stop.
- "How does X work?" → 3–6 sentences. Technical and specific.
- "Design / architect a system" → One sentence: the problem. One sentence: your approach. Stop. Let them ask follow-ups.
- "Tell me about a time..." → Problem → action → result in 3–4 sentences. Stop.
- "Tell me about yourself" / "Strengths?" / "Why this role?" → 80–120 words, specific, from my real work.
- Salary / location / logistics → Exact figures from my profile.
- Follow-up drill-downs → Direct and specific. Acknowledge gaps honestly and state the production fix.

RULES:
- No filler: "Great question", "Certainly", "Sure", "Absolutely", "Of course"
- No coaching language or meta-commentary
- Short question = short answer. Never pad.`;
}

export interface ConversationTurn {
  question: string;
  answer: string;
}

export async function* streamAnswer(
  question: string,
  model: LLMModel,
  systemPrompt: string,
  history: ConversationTurn[] = []
): AsyncGenerator<string> {
  const historyMessages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const turn of history) {
    if (turn.question) historyMessages.push({ role: 'user', content: turn.question });
    if (turn.answer) historyMessages.push({ role: 'assistant', content: turn.answer });
  }
  const messages = [...historyMessages, { role: 'user' as const, content: question }];

  if (model === 'claude-haiku' || model === 'claude-sonnet') {
    const stream = await getAnthropic().messages.stream({
      model: claudeModelId(model),
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
  } else {
    const gptModel = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';
    const stream = await getOpenAI().chat.completions.create({
      model: gptModel,
      stream: true,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? '';
      if (text) yield text;
    }
  }
}

export async function detectQuestion(recentText: string): Promise<{ isQuestion: boolean; question: string }> {
  const lower = recentText.toLowerCase();
  const hasSignal =
    recentText.includes('?') ||
    /\b(what|how|why|tell|describe|explain|can you|have you|walk|give me|where do you|talk me through|share|what's your|what are your|background|experience|yourself|strength|weakness|challenge|achievement|project|role|team|handle|approach|situation|example|define|implement|difference|compare)\b/.test(lower);

  if (!hasSignal) return { isQuestion: false, question: '' };

  const response = await getAnthropic().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,            // reduced — only needs short JSON
    messages: [
      {
        role: 'user',
        content: `Extract the interview question from this transcript. Only return isQuestion=true if the interviewer is clearly asking the candidate something.

"${recentText}"

Respond ONLY with JSON: {"isQuestion": true/false, "question": "extracted question or empty"}`,
      },
    ],
  });

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}';
    const clean = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(clean);
  } catch {
    return { isQuestion: false, question: '' };
  }
}

export async function* analyzeScreenshot(base64Image: string, model: LLMModel): AsyncGenerator<string, any, any> {
  // Always use Sonnet for vision — Haiku vision quality is insufficient for code
  const visionModel: LLMModel = model === 'gpt-4o' || model === 'gpt-4.1' ? model : 'claude-sonnet';
  yield* streamScreenshotAnswer(base64Image, visionModel);
}

async function* streamScreenshotAnswer(base64Image: string, model: LLMModel): AsyncGenerator<string> {
  const prompt = `You are looking at a screenshot that may contain a coding interview question, algorithm problem, system design question, or technical question.

First, identify what is shown in the image:
- If it is a coding/algorithm problem: provide a complete, working solution in the most appropriate language (default JavaScript/TypeScript unless another language is shown). Include: brief approach explanation, the full solution in a fenced code block, time complexity, space complexity.
- If it is a system design question: give a concise architecture answer (services, data flow, key decisions).
- If it is a multiple-choice or conceptual question: answer directly and explain why.
- If it is not a technical question at all: describe what you see briefly.

Format your response clearly with markdown. Keep the explanation tight — 2-4 sentences max before the code. The code must be complete and runnable.`;

  if (model === 'claude-haiku' || model === 'claude-sonnet') {
    const stream = await getAnthropic().messages.stream({
      model: claudeModelId(model),
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Image } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
  } else {
    const stream = await getOpenAI().chat.completions.create({
      model: 'llama-3.1-70b-versatile',
      stream: true,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? '';
      if (text) yield text;
    }
  }
}

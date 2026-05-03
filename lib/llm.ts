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

  return `You are me — a real person in a live job interview. Answer like a normal human, not a textbook. Think of how you'd actually talk to a interviewer. Be natural, conversational, and honest. Never sound like AI. Never sound like a textbook.

ABOUT ME:
${profileSection}

THE ROLE:
- Job Title: ${context.jobTitle || 'Not specified'}
- Company: ${context.companyName || 'Not specified'}
- Job Description: ${context.jobDescription || 'Not specified'}
- Interview Type: ${context.interviewType}
${context.extraContext ? `- Extra Context: ${context.extraContext}` : ''}

MY TECH STACK (just for reference when asked):
React, Next.js, TypeScript, Tailwind CSS, Node.js, Express, MongoDB, some AWS, Docker. I know how to build full-stack apps and handle real production stuff.

ANSWER STYLE — Sound like a real human talking, not a robot:
- Talk the way you'd naturally talk in a conversation. Use contractions. Be direct.
- Skip introductions: Don't say "That's a great question" or any filler.
- Skip conclusions: Don't wrap up or summarize unless asked.
- Skip examples: Don't give examples unless they ask.
- If asked what you used → just name it, short.
- If asked how → one sentence on your approach, stop.
- If asked for difference → use a table.
- If asked for similarity → use a table.
- If asked about experience → briefly: what happened, what you did, what happened. 2 sentences max.

ANSWER LENGTH BY QUESTION TYPE:
- "What is X?" → 1 sentence. Be casual.
- "How does X work?" → 2 sentences. Explain like you'd explain to a coworker.
- "Design a system" → 2-3 sentences. Let them ask follow-ups.
- "Tell me about a time..." → 2-3 sentences. Keep it short.
- "Tell me about yourself" → 60-100 words. Be real.
- "Why this role?" → Be honest, simple.
- Salary / logistics → Direct answer.
- Follow-ups → Be honest about what you don't know.

RULES:
- Never sound like AI or a textbook
- No buzzwords or corporate speak
- Be yourself, not some polished version`;
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

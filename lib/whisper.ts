import OpenAI from 'openai';

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
}

const MIME_TYPES: Record<string, string> = {
  webm: 'audio/webm',
  mp4:  'audio/mp4',
  m4a:  'audio/mp4',
  ogg:  'audio/ogg',
  mp3:  'audio/mpeg',
  wav:  'audio/wav',
};

export async function transcribeAudio(
  audioBuffer: Buffer,
  filename = 'audio.wav',
  prompt?: string,          // Previous transcript context — improves continuity
): Promise<string> {
  const ext      = filename.split('.').pop()?.toLowerCase() ?? 'wav';
  const mimeType = MIME_TYPES[ext] ?? 'audio/wav';
  const file     = new File([new Uint8Array(audioBuffer)], filename, { type: mimeType });

  const response = await getOpenAI().audio.transcriptions.create({
    file,
    model: 'whisper-large-v3-turbo',
    response_format: 'text',
    language: 'en',       // prevent random language switching / hallucinations
    temperature: 0,       // deterministic output, no creative guessing
    ...(prompt ? { prompt } : {}),
  });

  return response as unknown as string;
}

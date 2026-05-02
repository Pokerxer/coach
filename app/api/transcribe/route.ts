import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/whisper';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audio    = formData.get('audio') as File | null;
    const prompt   = formData.get('prompt') as string | null;

    if (!audio) {
      return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const text   = await transcribeAudio(buffer, audio.name, prompt ?? undefined);

    return NextResponse.json({ text });
  } catch (err) {
    console.error('[transcribe]', err);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}

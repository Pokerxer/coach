import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('resume') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');

    // Upload raw PDF to Supabase Storage
    const storagePath = `${user.id}/${Date.now()}-${file.name}`;
    await supabase.storage
      .from('resumes')
      .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false });

    // Send PDF to Claude for analysis
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            {
              type: 'text',
              text: `Analyze this resume and extract a comprehensive professional summary that will be used to generate tailored interview answers.

Return a structured summary covering:
- Full name and contact info (if present)
- Professional summary / objective
- Work experience (company, title, dates, key achievements and technologies used)
- Education (degree, institution, graduation year)
- Technical skills and tools
- Projects (name, description, tech stack)
- Certifications or awards
- Any other notable context

Write it as dense, factual prose that an AI interview coach can reference when crafting spoken answers. Be thorough — include specific numbers, technologies, and accomplishments.`,
            },
          ],
        },
      ],
    });

    const resumeContext = response.content[0].type === 'text' ? response.content[0].text : '';

    // Save to DB — store Claude's analysis as parsed_text, plus storage path
    const { data: resume, error } = await supabase
      .from('resumes')
      .insert({
        user_id: user.id,
        file_name: file.name,
        parsed_text: resumeContext,
        storage_path: storagePath,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ resume, parsedText: resumeContext });
  } catch (err) {
    console.error('[parse-resume]', err);
    return NextResponse.json({ error: 'Failed to process resume' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: resumes } = await supabase
      .from('resumes')
      .select('id, file_name, parsed_text, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    return NextResponse.json({ resumes });
  } catch (err) {
    console.error('[parse-resume GET]', err);
    return NextResponse.json({ error: 'Failed to fetch resumes' }, { status: 500 });
  }
}

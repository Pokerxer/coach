import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, job_title, company_name, model, interview_type, started_at, ended_at, status')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(50);

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error('[sessions GET]', err);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    const { data: session, error } = await supabase
      .from('sessions')
      .insert({
        user_id: user.id,
        job_title: body.jobTitle ?? null,
        company_name: body.companyName ?? null,
        job_description: body.jobDescription ?? null,
        extra_context: body.extraContext ?? null,
        resume_id: body.resumeId ?? null,
        model: body.model ?? 'claude-haiku',
        interview_type: body.interviewType ?? 'mixed',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ session });
  } catch (err) {
    console.error('[sessions POST]', err);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

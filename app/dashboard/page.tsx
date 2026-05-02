import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { Navbar } from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, ChevronRight, RotateCcw, BookOpen, Mic } from 'lucide-react';
import { Session } from '@/types';

async function getSessions(): Promise<Session[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50);
  return data ?? [];
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const sessions = await getSessions();

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-white/50 mt-1">{sessions.length} session{sessions.length !== 1 ? 's' : ''} total</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/exam/new">
              <Button size="lg" variant="outline" className="gap-2 border-violet-500/40 text-violet-300 hover:bg-violet-500/10 hover:border-violet-500">
                <BookOpen className="h-4 w-4" />
                New Exam
              </Button>
            </Link>
            <Link href="/session/new">
              <Button size="lg" className="gap-2">
                <Mic className="h-4 w-4" />
                New Interview
              </Button>
            </Link>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-white/10 rounded-xl">
            <p className="text-white/40 mb-4">No sessions yet</p>
            <Link href="/session/new">
              <Button>Start your first session</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/8 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-white font-medium truncate">
                      {session.job_title || 'Untitled Session'}
                    </p>
                    {session.company_name && (
                      <span className="text-white/40 text-sm truncate">@ {session.company_name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-white/40">
                    <span>{new Date(session.started_at).toLocaleDateString()} {new Date(session.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="capitalize">{session.interview_type}</span>
                    <span>{session.model}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={session.status === 'active' ? 'success' : 'secondary'}>
                    {session.status}
                  </Badge>
                  <Link href={`/session/new?from=${session.id}`} title="Retake with same setup">
                    <Button variant="ghost" size="icon">
                      <RotateCcw className="h-4 w-4 text-white/40" />
                    </Button>
                  </Link>
                  <Link href={`/session/${session.id}/summary`}>
                    <Button variant="ghost" size="icon">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

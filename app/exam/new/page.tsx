'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/store/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, BookOpen, Loader2, Zap, Brain } from 'lucide-react';

const MODELS = [
  { id: 'claude-sonnet', label: 'Claude Sonnet', desc: 'Best accuracy, slower' },
  { id: 'claude-haiku', label: 'Claude Haiku', desc: 'Faster responses' },
] as const;

export default function NewExamPage() {
  const router = useRouter();
  const { setSetupData } = useSessionStore();

  const [subject, setSubject] = useState('');
  const [context, setContext] = useState('');
  const [model, setModel] = useState<'claude-sonnet' | 'claude-haiku'>('claude-sonnet');
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    // Store minimal exam setup in session store so the exam page can read it
    setSetupData({
      jobTitle: subject || 'Exam',
      extraContext: context,
      model,
      interviewType: 'exam' as any,
    });
    // Use a UUID as the exam session ID (client-generated, no DB required)
    const id = crypto.randomUUID();
    router.push(`/exam/${id}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0A0F]">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-violet-400" />
          <span className="text-white font-semibold">New Exam Session</span>
        </div>
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full px-6 py-12 flex flex-col gap-8">
        {/* Mode badge */}
        <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
          <p className="text-violet-300 text-sm font-medium mb-1">Exam Mode</p>
          <p className="text-white/50 text-sm leading-relaxed">
            Capture your screen during an exam or quiz. AI reads the question, then streams a complete answer — invisible to proctors when using the Electron app.
          </p>
        </div>

        {/* Subject */}
        <div className="space-y-2">
          <Label className="text-white/80">Subject <span className="text-white/30">(optional)</span></Label>
          <Input
            placeholder="e.g. Data Structures, Machine Learning, Web Development…"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
          />
          <p className="text-white/30 text-xs">Helps the AI frame answers in the right context.</p>
        </div>

        {/* Extra context */}
        <div className="space-y-2">
          <Label className="text-white/80">Additional context <span className="text-white/30">(optional)</span></Label>
          <Textarea
            placeholder="e.g. This is a university midterm. Use pseudocode where requested. Prefer Python."
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none"
          />
        </div>

        {/* Model */}
        <div className="space-y-2">
          <Label className="text-white/80">Model</Label>
          <div className="grid grid-cols-2 gap-3">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  model === m.id
                    ? 'border-violet-500 bg-violet-500/10 text-white'
                    : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/8'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {m.id === 'claude-sonnet' ? (
                    <Brain className="h-4 w-4 text-violet-400" />
                  ) : (
                    <Zap className="h-4 w-4 text-cyan-400" />
                  )}
                  <span className="font-medium text-sm">{m.label}</span>
                </div>
                <p className="text-xs text-white/40">{m.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <Button
          size="lg"
          onClick={start}
          disabled={starting}
          className="w-full bg-violet-600 hover:bg-violet-500 text-white mt-2"
        >
          {starting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BookOpen className="h-4 w-4 mr-2" />}
          Start Exam Session
        </Button>
      </div>
    </div>
  );
}

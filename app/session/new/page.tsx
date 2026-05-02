'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSessionStore } from '@/store/session';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { JobDetailsStep } from '@/components/setup/JobDetailsStep';
import { BackgroundStep } from '@/components/setup/BackgroundStep';
import { PreferencesStep } from '@/components/setup/PreferencesStep';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const STEPS = ['Your Background', 'Job Details', 'Preferences'];

export default function NewSessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setupData, setSetupData } = useSessionStore();
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);

  // Pre-fill from a previous session when ?from=<id> is in the URL
  useEffect(() => {
    const fromId = searchParams.get('from');
    if (!fromId) return;
    fetch(`/api/sessions/${fromId}`)
      .then((r) => r.json())
      .then(({ session }) => {
        if (!session) return;
        setSetupData({
          jobTitle: session.job_title ?? '',
          companyName: session.company_name ?? '',
          jobDescription: session.job_description ?? '',
          extraContext: session.extra_context ?? '',
          resumeId: session.resume_id ?? null,
          resumeText: session.resumes?.parsed_text ?? '',
          model: session.model ?? 'claude-haiku',
          interviewType: session.interview_type ?? 'mixed',
        });
      })
      .catch(() => {});
  }, []);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const startSession = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: setupData.jobTitle,
          companyName: setupData.companyName,
          jobDescription: setupData.jobDescription,
          extraContext: setupData.extraContext,
          resumeId: setupData.resumeId,
          model: setupData.model,
          interviewType: setupData.interviewType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to start session');
        return;
      }

      router.push(`/session/${data.session.id}`);
    } catch {
      toast.error('Failed to start session');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i <= step ? 'bg-cyan-500 text-black' : 'bg-white/10 text-white/40'
                  }`}
                >
                  {i + 1}
                </div>
                <span className={`text-sm ${i === step ? 'text-white' : 'text-white/40'}`}>{s}</span>
                {i < STEPS.length - 1 && <div className="h-px w-6 bg-white/10" />}
              </div>
            ))}
          </div>
          <Progress value={((step + 1) / STEPS.length) * 100} className="h-1" />
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-10">
        <h2 className="text-xl font-bold text-white mb-6">{STEPS[step]}</h2>

        {step === 0 && <BackgroundStep />}
        {step === 1 && <JobDetailsStep />}
        {step === 2 && <PreferencesStep />}
      </div>

      {/* Footer nav */}
      <div className="border-t border-white/10 px-6 py-4 flex justify-between max-w-2xl mx-auto w-full">
        <Button variant="outline" onClick={back} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={next}>
            Next
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={startSession} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Start Session
          </Button>
        )}
      </div>
    </div>
  );
}

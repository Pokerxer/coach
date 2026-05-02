'use client';

import { useState, useEffect } from 'react';
import { useSessionStore } from '@/store/session';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Resume } from '@/types';
import { Loader2, Upload, CheckCircle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

export function BackgroundStep() {
  const { setupData, setSetupData } = useSessionStore();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/parse-resume')
      .then((r) => r.json())
      .then((data) => {
        const list = data?.resumes;
        if (Array.isArray(list)) {
          setResumes(list.filter(r => r && r.id));
        } else {
          setResumes([]);
        }
      })
      .catch(() => setResumes([]))
      .finally(() => setLoading(false));
  }, []);

  const uploadResume = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('resume', file);

    try {
      const res = await fetch('/api/parse-resume', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || 'Failed to upload resume');
        return;
      }
      const { resume, parsedText } = data;
      if (resume?.id) {
        setResumes((prev) => [resume, ...prev]);
        setSetupData({ resumeId: resume.id, resumeText: parsedText });
        toast.success('Resume uploaded and parsed!');
      }
    } catch {
      toast.error('Failed to upload resume');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base mb-3 block">Your Resume</Label>

        <label className="block border-2 border-dashed border-white/20 rounded-lg p-8 text-center cursor-pointer hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all">
          <input
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadResume(e.target.files[0])}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              <p className="text-white/60 text-sm">Parsing resume...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-white/40" />
              <p className="text-white/60 text-sm">Drop PDF here or click to upload</p>
            </div>
          )}
        </label>

        {resumes.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-white/50 mb-2">Previously uploaded:</p>
            {resumes.map((r) => (
              <button
                key={r.id}
                onClick={() => setSetupData({ resumeId: r.id, resumeText: r.parsed_text })}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                  setupData.resumeId === r.id
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                )}
              >
                <FileText className="h-4 w-4 text-white/50 shrink-0" />
                <span className="text-sm text-white flex-1 truncate">{r.file_name}</span>
                {setupData.resumeId === r.id && (
                  <CheckCircle className="h-4 w-4 text-cyan-400 shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
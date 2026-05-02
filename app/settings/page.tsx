'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase';
import { Resume } from '@/types';
import { Trash2, FileText, Loader2, Save, Upload } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user;
      if (!user) return;
      supabase.from('profiles').select('full_name').eq('id', user.id).single().then(({ data }) => {
        if (data) setName(data.full_name ?? '');
      });
    });

    fetch('/api/parse-resume')
      .then((r) => r.json())
      .then(({ resumes }) => setResumes(resumes ?? []));
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name })
      .eq('id', user.id);

    if (error) toast.error('Failed to save');
    else toast.success('Profile saved');
    setSaving(false);
  };

  const uploadResume = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('resume', file);
    try {
      const res = await fetch('/api/parse-resume', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Upload failed'); return; }
      setResumes((prev) => [data.resume, ...prev]);
      toast.success('Resume uploaded & analysed by Claude');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const deleteResume = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('resumes').delete().eq('id', id);
    if (error) { toast.error('Failed to delete'); return; }
    setResumes((prev) => prev.filter((r) => r.id !== id));
    toast.success('Resume deleted');
  };

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-10">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-white/50 mt-1">Manage your profile and resumes</p>
        </div>

        {/* Profile */}
        <section className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Profile</h2>
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <Button onClick={saveProfile} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </section>

        {/* Resumes */}
        <section className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Resumes</h2>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadResume(e.target.files[0])}
              />
              <Button size="sm" variant="outline" disabled={uploading}>
                {uploading
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Analysing…</>
                  : <><Upload className="h-3.5 w-3.5 mr-1" />Upload PDF</>}
              </Button>
            </label>
          </div>

          {uploading && (
            <div className="text-xs text-cyan-400/70 animate-pulse">
              Claude is reading and summarising your resume…
            </div>
          )}

          {resumes.length === 0 ? (
            <p className="text-white/30 text-sm">No resumes uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {resumes.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start gap-3 p-4 bg-white/5 border border-white/10 rounded-lg"
                >
                  <FileText className="h-4 w-4 text-white/40 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{r.file_name}</p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                    {r.parsed_text && (
                      <p className="text-xs text-white/50 mt-2 line-clamp-2 leading-relaxed">
                        {r.parsed_text.slice(0, 180)}…
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteResume(r.id)}
                    className="shrink-0 text-white/30 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}

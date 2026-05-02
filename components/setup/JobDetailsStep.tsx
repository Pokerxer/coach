'use client';

import { useState } from 'react';
import { useSessionStore } from '@/store/session';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Link as LinkIcon } from 'lucide-react';
import toast from 'react-hot-toast';

export function JobDetailsStep() {
  const { setupData, setSetupData } = useSessionStore();
  const [scraping, setScraping] = useState(false);
  const [jobUrl, setJobUrl] = useState('');

  const scrapeJob = async () => {
    if (!jobUrl) return;
    setScraping(true);
    try {
      const res = await fetch('/api/scrape-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: jobUrl }),
      });
      const { description } = await res.json();
      setSetupData({ jobDescription: description });
      toast.success('Job description imported!');
    } catch {
      toast.error('Failed to scrape job posting');
    } finally {
      setScraping(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Job Title</Label>
          <Input
            placeholder="e.g. Senior Software Engineer"
            value={setupData.jobTitle}
            onChange={(e) => setSetupData({ jobTitle: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Company Name</Label>
          <Input
            placeholder="e.g. Acme Corp"
            value={setupData.companyName}
            onChange={(e) => setSetupData({ companyName: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Job Posting URL</Label>
        <div className="flex gap-2">
          <Input
            placeholder="https://..."
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
          />
          <Button variant="outline" onClick={scrapeJob} disabled={scraping || !jobUrl}>
            {scraping ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
            <span className="ml-2">Import</span>
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Job Description</Label>
        <Textarea
          placeholder="Paste the job description here (or import from URL above)..."
          rows={6}
          value={setupData.jobDescription}
          onChange={(e) => setSetupData({ jobDescription: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Extra Context / Instructions</Label>
        <Textarea
          placeholder="Any additional context (e.g. I have 5 years of React experience, interviewing for a senior role...)"
          rows={3}
          value={setupData.extraContext}
          onChange={(e) => setSetupData({ extraContext: e.target.value })}
        />
      </div>
    </div>
  );
}

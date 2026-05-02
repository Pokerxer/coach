'use client';

import { use, useEffect, useState } from 'react';
import { useSessionStore } from '@/store/session';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Download, Home, MessageSquare, Loader2 } from 'lucide-react';
import { QAPair } from '@/types';
import toast from 'react-hot-toast';

export default function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { qaPairs: localPairs, transcript, setupData, clearSession } = useSessionStore();
  const [pairs, setPairs] = useState<QAPair[]>(localPairs);
  const [loading, setLoading] = useState(false);

  // If local state is empty (user refreshed or navigated back), load from server
  useEffect(() => {
    if (localPairs.length > 0) {
      setPairs(localPairs);
      return;
    }
    setLoading(true);
    fetch(`/api/sessions/${id}/qa`)
      .then((r) => r.json())
      .then(({ qaPairs }) => {
        if (qaPairs?.length) setPairs(qaPairs.map((p: any) => ({
          id: p.id,
          question: p.question,
          answer: p.answer,
          timestamp: new Date(p.created_at).getTime(),
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, localPairs]);

  const exportPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text('Interview Session Summary', 20, 20);
    doc.setFontSize(12);
    doc.text(`Job: ${setupData.jobTitle} @ ${setupData.companyName}`, 20, 35);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 45);
    doc.text(`Model: ${setupData.model}`, 20, 55);

    let y = 70;
    pairs.forEach((pair, i) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(11);
      doc.setTextColor(0, 150, 200);
      doc.text(`Q${i + 1}: ${pair.question}`, 20, y);
      y += 8;
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(pair.answer, 170);
      doc.text(lines, 20, y);
      y += lines.length * 6 + 10;
    });

    doc.save(`interview-summary-${id}.pdf`);
    toast.success('PDF exported!');
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Session Summary</h1>
            <p className="text-white/50 mt-1">
              {setupData.jobTitle && `${setupData.jobTitle} @ ${setupData.companyName}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={exportPDF} disabled={pairs.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
            <Link href="/dashboard">
              <Button>
                <Home className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
            <p className="text-3xl font-bold text-cyan-400">{pairs.length}</p>
            <p className="text-white/50 text-sm mt-1">Questions Answered</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
            <p className="text-3xl font-bold text-cyan-400">{transcript.length}</p>
            <p className="text-white/50 text-sm mt-1">Transcript Lines</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
            <p className="text-xl font-bold text-cyan-400 capitalize">{setupData.interviewType || '—'}</p>
            <p className="text-white/50 text-sm mt-1">Interview Type</p>
          </div>
        </div>

        {/* Q&A pairs */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-white/30" />
          </div>
        ) : pairs.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
            <MessageSquare className="h-10 w-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/40">No Q&A pairs recorded</p>
          </div>
        ) : (
          <div className="space-y-6">
            {pairs.map((pair, i) => (
              <div key={pair.id} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-white/10">
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-xs mt-0.5 shrink-0">Q{i + 1}</Badge>
                    <p className="text-white/80 text-sm">{pair.question}</p>
                  </div>
                </div>
                <div className="px-5 py-4">
                  <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">{pair.answer}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 p-4 rounded-xl border border-white/10 bg-white/5">
          <p className="text-white/40 text-xs text-center">
            Session data is saved to your account and accessible any time from your dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}

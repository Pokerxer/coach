'use client';

import { useSessionStore } from '@/store/session';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LLMModel, InterviewType } from '@/types';
import { Brain, Mic, Code2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const interviewTypes: { value: InterviewType; label: string; icon: React.ElementType }[] = [
  { value: 'behavioral', label: 'Behavioral', icon: Users },
  { value: 'technical', label: 'Technical', icon: Brain },
  { value: 'coding', label: 'Coding', icon: Code2 },
  { value: 'mixed', label: 'Mixed', icon: Mic },
];

export function PreferencesStep() {
  const { setupData, setSetupData } = useSessionStore();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>AI Model</Label>
        <Select value={setupData.model} onValueChange={(v) => setSetupData({ model: v as LLMModel })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="claude-haiku">Claude Haiku (Fast · Cheap)</SelectItem>
            <SelectItem value="claude-sonnet">Claude Sonnet (Recommended)</SelectItem>
            <SelectItem value="gpt-4o">GPT-4o</SelectItem>
            <SelectItem value="gpt-4.1">GPT-4.1</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label>Interview Type</Label>
        <div className="grid grid-cols-2 gap-2">
          {interviewTypes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setSetupData({ interviewType: value })}
              className={cn(
                'flex items-center gap-2 p-3 rounded-lg border transition-all text-sm font-medium',
                setupData.interviewType === value
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                  : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-white/5">
        <div>
          <p className="text-sm font-medium text-white">Auto-Detect Questions</p>
          <p className="text-xs text-white/50 mt-0.5">
            Automatically generate answers when a question is detected
          </p>
        </div>
        <Switch
          checked={setupData.autoDetect}
          onCheckedChange={(v) => setSetupData({ autoDetect: v })}
        />
      </div>
    </div>
  );
}

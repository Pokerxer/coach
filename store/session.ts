import { create } from 'zustand';
import { QAPair, TranscriptLine, SessionSetupData, LLMModel, InterviewType } from '@/types';

interface SessionState {
  // Setup
  setupData: SessionSetupData;
  setSetupData: (data: Partial<SessionSetupData>) => void;

  // Active session
  sessionId: string | null;
  setSessionId: (id: string | null) => void;

  isRecording: boolean;
  setIsRecording: (val: boolean) => void;

  isMuted: boolean;
  setIsMuted: (val: boolean) => void;

  transcript: TranscriptLine[];
  addTranscriptLine: (line: TranscriptLine) => void;
  interimText: string;
  setInterimText: (text: string) => void;

  qaPairs: QAPair[];
  addQAPair: (pair: QAPair) => void;
  updateLastAnswer: (text: string) => void;

  currentAnswer: string;
  setCurrentAnswer: (text: string) => void;
  appendCurrentAnswer: (text: string) => void;

  isGeneratingAnswer: boolean;
  setIsGeneratingAnswer: (val: boolean) => void;

  startedAt: number | null;
  setStartedAt: (ts: number | null) => void;

  credits: number;
  setCredits: (credits: number) => void;

  codingMode: boolean;
  setCodingMode: (val: boolean) => void;

  clearSession: () => void;
}

const DEFAULT_SETUP: SessionSetupData = {
  jobTitle: '',
  companyName: '',
  jobDescription: '',
  extraContext: '',
  resumeId: null,
  resumeText: '',
  model: 'claude-haiku',
  autoDetect: true,
  interviewType: 'mixed',
};

export const useSessionStore = create<SessionState>((set, get) => ({
  setupData: DEFAULT_SETUP,
  setSetupData: (data) => set((s) => ({ setupData: { ...s.setupData, ...data } })),

  sessionId: null,
  setSessionId: (id) => set({ sessionId: id }),

  isRecording: false,
  setIsRecording: (val) => set({ isRecording: val }),

  isMuted: false,
  setIsMuted: (val) => set({ isMuted: val }),

  transcript: [],
  addTranscriptLine: (line) => set((s) => ({ transcript: [...s.transcript, line] })),
  interimText: '',
  setInterimText: (text) => set({ interimText: text }),

  qaPairs: [],
  addQAPair: (pair) => set((s) => ({ qaPairs: [...s.qaPairs, pair] })),
  updateLastAnswer: (text) =>
    set((s) => {
      const pairs = [...s.qaPairs];
      if (pairs.length > 0) {
        pairs[pairs.length - 1] = { ...pairs[pairs.length - 1], answer: text };
      }
      return { qaPairs: pairs };
    }),

  currentAnswer: '',
  setCurrentAnswer: (text) => set({ currentAnswer: text }),
  appendCurrentAnswer: (text) => set((s) => ({ currentAnswer: s.currentAnswer + text })),

  isGeneratingAnswer: false,
  setIsGeneratingAnswer: (val) => set({ isGeneratingAnswer: val }),

  startedAt: null,
  setStartedAt: (ts) => set({ startedAt: ts }),

  credits: 0,
  setCredits: (credits) => set({ credits }),

  codingMode: false,
  setCodingMode: (val) => set({ codingMode: val }),

  clearSession: () =>
    set({
      sessionId: null,
      isRecording: false,
      isMuted: false,
      transcript: [],
      interimText: '',
      qaPairs: [],
      currentAnswer: '',
      isGeneratingAnswer: false,
      startedAt: null,
      codingMode: false,
    }),
}));

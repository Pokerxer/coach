export type SubscriptionPlan = 'free' | 'monthly' | 'lifetime';
export type InterviewType = 'behavioral' | 'technical' | 'coding' | 'mixed';
export type LLMModel = 'claude-haiku' | 'claude-sonnet' | 'gpt-4o' | 'gpt-4.1';
export type SessionStatus = 'active' | 'ended';

export interface Profile {
  id: string;
  full_name: string | null;
  credits: number;
  subscription_plan: SubscriptionPlan;
  subscription_expires_at: string | null;
  created_at: string;
}

export interface Resume {
  id: string;
  user_id: string;
  file_name: string;
  parsed_text: string;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  job_title: string | null;
  company_name: string | null;
  job_description: string | null;
  extra_context: string | null;
  resume_id: string | null;
  model: LLMModel;
  interview_type: InterviewType;
  started_at: string;
  ended_at: string | null;
  credits_used: number;
  status: SessionStatus;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'purchase' | 'session_start' | 'session_extend' | 'free_trial';
  stripe_payment_intent_id: string | null;
  created_at: string;
}

export interface QAPair {
  id: string;
  question: string;
  answer: string;
  timestamp: number;
}

export interface TranscriptLine {
  id: string;
  text: string;
  timestamp: number;
}

export interface ProfileData {
  fullName: string;
  currentTitle: string;
  yearsOfExperience: string;
  location: string;
  linkedin: string;
  currentCompany: string;
  currentResponsibilities: string;
  workHistory: string;
  keyAchievements: string;
  greatestAchievement: string;
  biggestChallenge: string;
  technicalSkills: string;
  softSkills: string;
  toolsAndTechnologies: string;
  education: string;
  strengths: string;
  weaknesses: string;
  whyLeavingCurrentRole: string;
  careerGoals: string;
  leadershipExperience: string;
  teamworkExample: string;
  failureAndLesson: string;
  salaryExpectation: string;
  additionalContext: string;
}

export interface SessionSetupData {
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  extraContext: string;
  resumeId: string | null;
  resumeText: string;
  model: LLMModel;
  autoDetect: boolean;
  interviewType: InterviewType;
}

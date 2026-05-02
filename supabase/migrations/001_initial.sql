-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles (extends Supabase Auth users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  credits DECIMAL DEFAULT 0,
  subscription_plan TEXT DEFAULT 'free' CHECK (subscription_plan IN ('free', 'monthly', 'lifetime')),
  subscription_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on sign up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Resumes
-- parsed_text holds Claude's structured analysis of the PDF (not raw text extraction)
-- storage_path points to the raw PDF in Supabase Storage bucket 'resumes'
CREATE TABLE resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  parsed_text TEXT,           -- Claude's analysis / resume context
  storage_path TEXT,          -- Path in 'resumes' storage bucket
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions (metadata only — transcripts/Q&A are never stored server-side)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  job_title TEXT,
  company_name TEXT,
  job_description TEXT,
  extra_context TEXT,
  resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
  model TEXT DEFAULT 'claude-sonnet',
  interview_type TEXT DEFAULT 'mixed',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  credits_used DECIMAL DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'ended'))
);

-- Credit Transactions
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount DECIMAL NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'session_start', 'session_extend', 'free_trial')),
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RPC: Atomically deduct credits (prevents race conditions)
CREATE OR REPLACE FUNCTION deduct_credits(
  user_id UUID,
  amount DECIMAL,
  session_id UUID,
  tx_type TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET credits = credits - amount WHERE id = user_id AND credits >= amount;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;
  INSERT INTO credit_transactions (user_id, amount, type)
  VALUES (user_id, -amount, tx_type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Atomically add credits after Stripe payment
CREATE OR REPLACE FUNCTION add_credits(
  user_id UUID,
  amount DECIMAL,
  stripe_payment_intent_id TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET credits = credits + amount WHERE id = user_id;
  INSERT INTO credit_transactions (user_id, amount, type, stripe_payment_intent_id)
  VALUES (user_id, amount, 'purchase', stripe_payment_intent_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can manage own resumes" ON resumes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own sessions" ON sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view own transactions" ON credit_transactions FOR SELECT USING (auth.uid() = user_id);

-- Storage policies for the 'resumes' bucket (bucket must already exist)
-- Run these in the Supabase SQL editor after creating the bucket:

CREATE POLICY "Users can upload own resumes"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can read own resumes"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own resumes"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

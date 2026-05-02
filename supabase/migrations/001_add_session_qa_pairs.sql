-- Migration: Add session_qa_pairs table
-- Created: 2026-04-28

BEGIN;

-- Create session_qa_pairs table to store Q&A from each interview session
CREATE TABLE IF NOT EXISTS session_qa_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster queries by session_id
CREATE INDEX IF NOT EXISTS idx_session_qa_pairs_session_id ON session_qa_pairs(session_id);

-- Enable RLS
ALTER TABLE session_qa_pairs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own Q&A pairs
CREATE POLICY "Users can view own Q&A pairs" ON session_qa_pairs
  FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM sessions WHERE id = session_qa_pairs.session_id));

-- RLS Policy: Users can insert their own Q&A pairs
CREATE POLICY "Users can insert own Q&A pairs" ON session_qa_pairs
  FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT user_id FROM sessions WHERE id = session_qa_pairs.session_id));

COMMIT;
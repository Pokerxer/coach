# 🦜 Agent Prompt: Build a Real-Time AI Interview Assistant (Parakeet AI Clone)

---

## ROLE

You are a senior full-stack engineer and systems architect. Your task is to build a
complete, production-grade **Real-Time AI Interview Assistant** web application — similar
to Parakeet AI (parakeet-ai.com). This app listens to a user's live interview audio,
detects questions automatically, and generates tailored AI answers in real time — all
while remaining discreet and invisible to screen-share tools.

---

## PROJECT OVERVIEW

**App Name**: (Choose something like "CoachAI", "InterviewCopilot", or leave as placeholder)
**Type**: Full-stack web application + optional Electron desktop wrapper
**Primary Purpose**: Help job seekers get AI-generated answers during live video interviews
in real time without being detected by the interviewer.

---

## TECH STACK

### Frontend
- **Framework**: Next.js 14+ (App Router) with TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **State Management**: Zustand
- **Real-time**: WebSockets (for streaming LLM responses)
- **Audio**: Web Audio API + MediaRecorder API (browser-based capture)

### Backend
- **Runtime**: Node.js with Express or Next.js API routes
- **Speech-to-Text**: OpenAI Whisper API (or Deepgram for real-time streaming)
- **LLM**: Anthropic Claude API (claude-sonnet-4-20250514) as primary; OpenAI GPT-4o as secondary
- **File Parsing**: pdf-parse (for resume PDF extraction)
- **Web Scraping**: Cheerio + Axios (for job description URL scraping)
- **Auth**: Supabase Auth (email/password + Google OAuth)
- **Database**: Supabase (PostgreSQL) for users, sessions, credits
- **Payments**: Stripe (credit packs + subscriptions)

### Desktop (Optional Phase 2)
- **Framework**: Electron with Node.js
- **Stealth Window**: `setWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` on Windows;
  `setSharingType: NSWindowSharingNone` on macOS

---

## FULL FEATURE LIST TO BUILD

### 1. Authentication & Onboarding
- Sign up / Sign in with email + Google OAuth via Supabase
- Onboarding flow: upload resume (PDF), set name, preferred LLM model
- Dashboard home showing credits, recent sessions, quick-start button

### 2. Session Setup (Pre-Interview Configuration)
Create a "New Session" wizard with these steps:

**Step 1 — Job Details**
- Input field: Job Title
- Input field: Company Name
- URL field: "Paste job posting URL" — auto-scrape and extract job description using
  Cheerio on the backend
- Textarea: Manually paste job description (fallback)
- Textarea: "Extra context / instructions" (user can paste anything)

**Step 2 — Your Background**
- Upload resume as PDF — parse and store text server-side
- Previously uploaded resumes should be selectable (stored per user)
- Upload supporting documents (portfolio, certifications, etc.)

**Step 3 — Preferences**
- Select LLM model: Claude Sonnet / GPT-4o / GPT-4.1
- Toggle: Auto-detect questions ON/OFF
- Select interview type: Behavioral / Technical / Coding / Mixed
- Language preference (auto-detect from audio is default)

### 3. Live Session Interface
This is the core screen. Build it as a real-time dashboard:

**Layout (split panels):**
- LEFT PANEL: Live audio transcript (streaming text, auto-scrolling)
- RIGHT PANEL: AI-generated answer (streaming token-by-token output)
- BOTTOM BAR: Controls — Start/Stop recording, Manual trigger button, Mute toggle,
  End session button
- TOP BAR: Session timer, credit counter, model badge, keyboard shortcuts hint

**Behavior:**
- On session start: request browser microphone access (and system audio if Electron)
- Stream audio in chunks (every 3–5 seconds) to Whisper for transcription
- Transcription appears live in left panel
- Question detection runs on each new transcription chunk:
  - Check if chunk contains a question (starts with: what, how, why, tell me, describe,
    explain, can you, have you, walk me through, etc.)
  - If detected: automatically send to LLM with full context (resume + job desc + history)
  - Stream LLM response token-by-token into right panel
- Manual trigger: user can press a hotkey (e.g. Space) to force-generate an answer
  for the latest transcript chunk
- Support sending a custom message mid-session (text input at bottom of right panel)

**Keyboard Shortcuts:**
- `Space` — Manual answer trigger
- `Cmd/Ctrl + M` — Toggle mute
- `Cmd/Ctrl + E` — End session
- `Cmd/Ctrl + C` — Copy last answer

### 4. Coding Interview Mode
- Toggle "Coding Mode" in session preferences
- In-browser screenshot capture (using `getDisplayMedia` or Electron screen capture)
- Capture screenshot every N seconds OR on manual trigger
- Send screenshot as base64 image to Claude Vision / GPT-4o Vision with prompt:
  "This is a coding interview question on screen. Provide a solution with explanation."
- Show code answer in a syntax-highlighted code block (use `react-syntax-highlighter`)
- Include time complexity and space complexity in the answer

### 5. Post-Session Summary
After session ends:
- Show full transcript
- Show all Q&A pairs from the session
- Export as PDF (using jsPDF or react-pdf)
- Delete all data from server (privacy — transcripts auto-deleted post session)
- Show performance insights: number of questions answered, response times, topics covered

### 6. Credits & Billing (Stripe Integration)
- Credit model: 1 credit = 30-minute session (0.5 credits deducted on start,
  auto-extends and deducts 0.5 more before expiry)
- Free tier: 10 minutes free trial per 15 minutes (rate-limited by IP + account)
- Credit packs: 5 credits ($9.99), 15 credits ($24.99), 30 credits ($44.99)
- Subscription plan: Unlimited ($29.99/month)
- Lifetime plan: One-time $99 (unlimited forever)
- Stripe Checkout + Stripe Webhooks for payment confirmation + credit assignment
- Credit balance shown in dashboard and session header

### 7. Background Meeting Detection (Paid Feature)
- For subscribed users: run a lightweight background service
- Detect when Zoom, Teams, or Google Meet is open/active (via window title detection
  in Electron, or tab URL monitoring in browser extension)
- Show a notification toast: "Interview detected — start Parakeet session?"
- One-click to jump into a configured session

### 8. Mobile-Optimized Version
- Responsive layout that works on phone browsers
- Append `/mobile` to session URL for compact single-column layout
- Show transcript and answer stacked vertically
- Large tap targets for all controls
- Works simultaneously with desktop version on same session

---

## DATABASE SCHEMA (Supabase / PostgreSQL)

```sql
-- Users (handled by Supabase Auth, extend with profile)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT,
  credits DECIMAL DEFAULT 0,
  subscription_plan TEXT DEFAULT 'free', -- 'free' | 'monthly' | 'lifetime'
  subscription_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Resumes
CREATE TABLE resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  file_name TEXT,
  parsed_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  job_title TEXT,
  company_name TEXT,
  job_description TEXT,
  extra_context TEXT,
  resume_id UUID REFERENCES resumes(id),
  model TEXT DEFAULT 'claude-sonnet',
  interview_type TEXT DEFAULT 'mixed',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  credits_used DECIMAL DEFAULT 0,
  status TEXT DEFAULT 'active' -- 'active' | 'ended'
  -- NOTE: transcripts and Q&A are NOT stored server-side (privacy)
  -- They are kept in-memory / client-side only and deleted on session end
);

-- Credit Transactions
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  amount DECIMAL, -- positive = added, negative = deducted
  type TEXT, -- 'purchase' | 'session_start' | 'session_extend' | 'free_trial'
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API ROUTES TO BUILD

### Auth (handled by Supabase client SDK)

### Session Management
- `POST /api/sessions` — Create new session, deduct 0.5 credits
- `PATCH /api/sessions/:id/end` — End session, record end time
- `GET /api/sessions` — List user's past sessions (metadata only)

### Audio & AI Pipeline
- `POST /api/transcribe` — Accept base64 audio blob → call Whisper → return transcript text
- `POST /api/detect-question` — Accept transcript chunk → return `{ isQuestion: boolean, question: string }`
- `POST /api/answer` (streaming) — Accept question + context → stream LLM response via SSE
- `POST /api/scrape-job` — Accept URL → scrape and return job description text
- `POST /api/parse-resume` — Accept PDF file → parse and return text

### Billing
- `POST /api/create-checkout-session` — Create Stripe checkout session
- `POST /api/webhooks/stripe` — Handle payment confirmation → add credits

---

## LLM SYSTEM PROMPT (for answer generation)

Use this system prompt when calling the LLM during a live session:

```
You are an expert interview coach embedded in a real-time interview assistant.
Your job is to generate the perfect spoken answer to an interview question on behalf of the candidate.

CANDIDATE CONTEXT:
- Resume: {resume_text}
- Job Title Applying For: {job_title}
- Company: {company_name}
- Job Description: {job_description}
- Extra Context: {extra_context}
- Interview Type: {interview_type}

RULES FOR YOUR RESPONSE:
1. Write as if the candidate is speaking naturally out loud — first person, conversational tone
2. Keep answers concise but complete (60–120 words for behavioral, more for technical)
3. For behavioral questions, use the STAR method (Situation, Task, Action, Result)
4. For technical questions, explain clearly with examples from the candidate's background
5. For coding questions, provide working code with brief explanation
6. Reference specific details from the resume to make answers feel authentic and personal
7. Never mention that you are an AI or that you are generating this answer
8. If the question is ambiguous, answer the most likely interpretation
9. Start the answer immediately — no preamble like "Great question" or "Certainly"
10. Match the language of the question (if asked in French, answer in French)
```

---

## QUESTION DETECTION PROMPT

Use this lightweight prompt to check if a transcript chunk contains a question:

```
You are a question detector. Analyze the following transcript chunk from a job interview.
Determine if it contains a question being asked TO the candidate (not by the candidate).

Transcript chunk: "{chunk}"

Respond with ONLY valid JSON: {"isQuestion": true/false, "question": "extracted question or empty string"}

Common interview question starters: what, how, why, tell me, describe, explain, can you,
have you, walk me through, give me an example, what would you, how would you, where do you see
```

---

## STEALTH / UNDETECTABILITY IMPLEMENTATION

### Browser (Web Version)
- The browser tab itself is visible, so for the web version, instruct users to open the
  app in a separate non-shared browser window
- Provide a "Safe Mode" layout: minimal white UI that looks like a notes app
- Offer a browser extension (Phase 3) that injects a subtle sidebar

### Electron (Desktop Version — Phase 2)
Build an Electron wrapper with these stealth features:

```javascript
// main.js — Electron main process
const { BrowserWindow } = require('electron');

const win = new BrowserWindow({
  width: 400,
  height: 700,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,          // Hidden from taskbar/dock
  webPreferences: {
    nodeIntegration: true,
    contextIsolation: false
  }
});

// Windows: Exclude from screen capture
if (process.platform === 'win32') {
  win.setContentProtection(true);
  // Uses SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) internally
}

// macOS: Exclude from screen share
if (process.platform === 'darwin') {
  win.setContentProtection(true);
  // Uses setSharingType: NSWindowSharingNone
}

// Hide from Cmd+Tab / Alt+Tab
win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
```

---

## UI/UX DESIGN DIRECTION

Follow these design principles:

**Aesthetic**: Dark, professional, minimal — think a Bloomberg terminal meets a modern
SaaS product. Dark background (#0A0A0F), neon green or cyan accent (#00FF88 or #00D4FF),
monospace font for transcription, clean sans-serif for UI.

**Key Screens to Design:**
1. Landing page — Hero with demo GIF/video, pricing section, FAQ, testimonials
2. Sign in / Sign up — Clean centered card
3. Dashboard — Grid of recent sessions + big "Start New Session" CTA + credit balance
4. Session Setup Wizard — 3-step modal with progress indicator
5. Live Session — Split-panel real-time view (the core experience)
6. Post-Session Summary — Q&A log + export options
7. Billing / Credits page — Pricing cards + transaction history
8. Settings — Profile, resume management, API preferences

**Micro-interactions:**
- Pulsing red dot when recording is active
- Token-by-token streaming animation for AI answers (typewriter effect)
- Smooth slide-in for new transcript lines
- Toast notifications for "Question detected!", "Answer ready", "Credits low"
- Loading skeleton for answer while generating

---

## FOLDER STRUCTURE

```
/
├── app/                        # Next.js App Router
│   ├── (auth)/
│   │   ├── signin/page.tsx
│   │   └── signup/page.tsx
│   ├── dashboard/page.tsx
│   ├── session/
│   │   ├── new/page.tsx        # Session setup wizard
│   │   └── [id]/
│   │       ├── page.tsx        # Live session
│   │       └── mobile/page.tsx # Mobile layout
│   ├── billing/page.tsx
│   ├── settings/page.tsx
│   └── api/
│       ├── transcribe/route.ts
│       ├── answer/route.ts     # SSE streaming route
│       ├── detect-question/route.ts
│       ├── scrape-job/route.ts
│       ├── parse-resume/route.ts
│       ├── sessions/route.ts
│       └── webhooks/stripe/route.ts
├── components/
│   ├── session/
│   │   ├── AudioCapture.tsx
│   │   ├── TranscriptPanel.tsx
│   │   ├── AnswerPanel.tsx
│   │   ├── SessionControls.tsx
│   │   └── CodingMode.tsx
│   ├── setup/
│   │   ├── JobDetailsStep.tsx
│   │   ├── BackgroundStep.tsx
│   │   └── PreferencesStep.tsx
│   ├── ui/                     # shadcn/ui components
│   └── layout/
│       ├── Navbar.tsx
│       └── Sidebar.tsx
├── lib/
│   ├── supabase.ts
│   ├── stripe.ts
│   ├── whisper.ts
│   ├── llm.ts                  # Claude + GPT abstraction
│   ├── pdf-parser.ts
│   └── scraper.ts
├── store/
│   └── session.ts              # Zustand store
├── hooks/
│   ├── useAudioCapture.ts
│   ├── useTranscription.ts
│   └── useSession.ts
├── types/
│   └── index.ts
├── electron/                   # Optional Electron wrapper
│   └── main.js
└── supabase/
    └── migrations/
        └── 001_initial.sql
```

---

## IMPLEMENTATION ORDER

Build in this exact order to have a working MVP as fast as possible:

```
Phase 1 — Foundation (Days 1–3)
  ✅ Next.js project setup with TypeScript + Tailwind + shadcn/ui
  ✅ Supabase auth (sign up, sign in, session management)
  ✅ Basic dashboard layout
  ✅ Database schema + migrations

Phase 2 — Core Pipeline (Days 4–7)
  ✅ Resume PDF upload + parsing API
  ✅ Job URL scraping API
  ✅ Session setup wizard (3 steps)
  ✅ Browser microphone capture hook (useAudioCapture)
  ✅ Whisper transcription API route
  ✅ Question detection logic
  ✅ Claude streaming answer generation (SSE)

Phase 3 — Live Session UI (Days 8–10)
  ✅ Split-panel live session screen
  ✅ Real-time transcript display with auto-scroll
  ✅ Streaming answer panel (typewriter effect)
  ✅ Session controls + keyboard shortcuts
  ✅ Session timer + credit countdown

Phase 4 — Billing & Credits (Days 11–12)
  ✅ Stripe integration (checkout sessions)
  ✅ Stripe webhooks → credit assignment
  ✅ Credit deduction on session start/extend
  ✅ Billing page with pricing cards

Phase 5 — Polish & Extras (Days 13–15)
  ✅ Post-session summary + PDF export
  ✅ Coding mode (screen capture + vision API)
  ✅ Mobile layout (/mobile route)
  ✅ Landing page
  ✅ Settings page (resume management)
```

---

## ENVIRONMENT VARIABLES NEEDED

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI APIs
OPENAI_API_KEY=           # For Whisper + GPT-4o
ANTHROPIC_API_KEY=        # For Claude

# Stripe
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID_5_CREDITS=
STRIPE_PRICE_ID_15_CREDITS=
STRIPE_PRICE_ID_30_CREDITS=
STRIPE_PRICE_ID_MONTHLY=
STRIPE_PRICE_ID_LIFETIME=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## CRITICAL IMPLEMENTATION NOTES

1. **Audio Streaming**: Don't send full recordings — chunk audio every 3 seconds using
   MediaRecorder with `timeslice: 3000`. Send each blob to Whisper immediately for
   low-latency transcription.

2. **SSE Streaming**: The `/api/answer` route MUST use Server-Sent Events (SSE) to stream
   Claude/GPT tokens one-by-one. Use `ReadableStream` in Next.js App Router:
   ```typescript
   return new Response(stream, {
     headers: {
       'Content-Type': 'text/event-stream',
       'Cache-Control': 'no-cache',
       'Connection': 'keep-alive'
     }
   });
   ```

3. **Privacy**: Never persist transcript text or Q&A pairs to the database.
   Keep them in Zustand store (client memory only). On session end, call
   `useSessionStore.getState().clearSession()`. Server-side, do not log transcripts.

4. **Question Detection Efficiency**: To save API costs, run a simple regex check first
   before calling the LLM detector. Only call the LLM if the regex finds interrogative
   keywords. This reduces unnecessary API calls by ~70%.

5. **Credit Atomicity**: Use Supabase RPC functions (PostgreSQL) for credit deductions
   to prevent race conditions. Never deduct credits from the client side.

---

## DELIVERABLES EXPECTED FROM YOU (THE AGENT)

1. Complete, runnable Next.js codebase with all routes and components
2. All API routes fully implemented (transcription, answer streaming, scraping, billing)
3. Supabase migration SQL file
4. Zustand store for session state
5. All custom hooks (useAudioCapture, useTranscription, useSession)
6. Stripe integration (checkout + webhooks)
7. Responsive UI for all screens listed above
8. `.env.example` file with all required variables
9. `README.md` with setup instructions
10. Optional: Electron `main.js` with stealth window configuration

---

Start by scaffolding the Next.js project, installing all dependencies, setting up
Supabase, and building the authentication flow. Then proceed through the phases in order.
Ask for clarification only if a business logic decision is genuinely ambiguous.
Otherwise, make sensible defaults and keep building.
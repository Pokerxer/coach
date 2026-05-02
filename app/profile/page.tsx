'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ProfileData } from '@/types';
import { Loader2, Save, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const EMPTY: ProfileData = {
  fullName: '',
  currentTitle: '',
  yearsOfExperience: '',
  location: '',
  linkedin: '',
  currentCompany: '',
  currentResponsibilities: '',
  workHistory: '',
  keyAchievements: '',
  greatestAchievement: '',
  biggestChallenge: '',
  technicalSkills: '',
  softSkills: '',
  toolsAndTechnologies: '',
  education: '',
  strengths: '',
  weaknesses: '',
  whyLeavingCurrentRole: '',
  careerGoals: '',
  leadershipExperience: '',
  teamworkExample: '',
  failureAndLesson: '',
  salaryExpectation: '',
  additionalContext: '',
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {hint && <p className="text-xs text-white/40 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-white/80">{label}</Label>
      {hint && <p className="text-xs text-white/40">{hint}</p>}
      {children}
    </div>
  );
}

export default function ProfilePage() {
  const [data, setData] = useState<ProfileData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then(({ profileData }) => {
        if (profileData && Object.keys(profileData).length > 0) {
          setData({ ...EMPTY, ...profileData });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const set = (key: keyof ProfileData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setData((d) => ({ ...d, [key]: e.target.value }));

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileData: data }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      toast.success('Profile saved');
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">My Profile</h1>
            <p className="text-white/50 mt-1 text-sm">
              Fill this in once. CoachAI will answer every interview question as you, using these details.
            </p>
          </div>
          <Button onClick={save} disabled={saving} className="shrink-0">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : saved ? (
              <CheckCircle className="h-4 w-4 mr-2 text-green-400" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saved ? 'Saved' : 'Save Profile'}
          </Button>
        </div>

        {/* 1. Basic info */}
        <Section title="About You" hint="The basics — name, title, where you are now.">
          <Field label="Full Name">
            <Input value={data.fullName} onChange={set('fullName')} placeholder="e.g. John Adeyemi" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Current Job Title">
              <Input value={data.currentTitle} onChange={set('currentTitle')} placeholder="e.g. Senior Software Engineer" />
            </Field>
            <Field label="Years of Experience">
              <Input value={data.yearsOfExperience} onChange={set('yearsOfExperience')} placeholder="e.g. 6 years" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Location">
              <Input value={data.location} onChange={set('location')} placeholder="e.g. Lagos, Nigeria" />
            </Field>
            <Field label="LinkedIn (optional)">
              <Input value={data.linkedin} onChange={set('linkedin')} placeholder="linkedin.com/in/..." />
            </Field>
          </div>
        </Section>

        {/* 2. Current role */}
        <Section title="Current / Most Recent Role" hint="What you do day-to-day right now.">
          <Field label="Company Name">
            <Input value={data.currentCompany} onChange={set('currentCompany')} placeholder="e.g. Flutterwave" />
          </Field>
          <Field label="Key Responsibilities" hint="What do you actually do? Be specific — bullet points are fine.">
            <Textarea
              value={data.currentResponsibilities}
              onChange={set('currentResponsibilities')}
              rows={4}
              placeholder="• Led a team of 5 engineers building the payments API&#10;• Reduced API latency by 40% through caching improvements&#10;• Owned the onboarding flow used by 200k+ merchants"
            />
          </Field>
        </Section>

        {/* 3. Work history */}
        <Section title="Work History" hint="Previous roles — company, title, duration, and what you did. Include internships if relevant.">
          <Field label="Previous Roles" hint="Most recent first. One role per paragraph works well.">
            <Textarea
              value={data.workHistory}
              onChange={set('workHistory')}
              rows={6}
              placeholder="Paystack — Backend Engineer (2021–2023)&#10;Built and maintained core transaction processing service handling $1B+ annually. Migrated monolith to microservices.&#10;&#10;Andela — Software Engineer (2019–2021)&#10;Embedded in a US fintech team as a remote engineer. Built React dashboards used by 50k+ users."
            />
          </Field>
        </Section>

        {/* 4. Achievements */}
        <Section title="Achievements & Impact" hint="The things you're most proud of professionally.">
          <Field label="Key Achievements" hint="Quantify where possible — numbers stand out.">
            <Textarea
              value={data.keyAchievements}
              onChange={set('keyAchievements')}
              rows={4}
              placeholder="• Reduced customer churn by 18% by redesigning the onboarding flow&#10;• Delivered project 3 weeks early saving $120k in contractor costs&#10;• Grew API adoption from 500 to 4,000 developers in 6 months"
            />
          </Field>
          <Field label="Greatest Single Professional Achievement" hint="Pick your best one — the story you'd tell if asked 'What are you most proud of?'">
            <Textarea
              value={data.greatestAchievement}
              onChange={set('greatestAchievement')}
              rows={3}
              placeholder="Led the re-architecture of our payments engine which had been causing 3–4 outages a month. After 6 months of careful migration, we achieved 99.98% uptime and processed our first $1B quarter."
            />
          </Field>
          <Field label="Biggest Challenge Overcome" hint="A hard situation, how you handled it, and what the outcome was.">
            <Textarea
              value={data.biggestChallenge}
              onChange={set('biggestChallenge')}
              rows={3}
              placeholder="Inherited a legacy codebase with no tests and a team that was burnt out. I introduced weekly refactor sessions, wrote the first 200 unit tests myself to set the standard, and within 4 months test coverage went from 0% to 68%."
            />
          </Field>
        </Section>

        {/* 5. Skills */}
        <Section title="Skills & Tools" hint="What you're technically good at.">
          <Field label="Technical Skills" hint="Languages, frameworks, concepts — comma separated.">
            <Textarea
              value={data.technicalSkills}
              onChange={set('technicalSkills')}
              rows={2}
              placeholder="JavaScript, TypeScript, Python, React, Node.js, PostgreSQL, Redis, REST APIs, GraphQL, system design"
            />
          </Field>
          <Field label="Tools & Platforms">
            <Textarea
              value={data.toolsAndTechnologies}
              onChange={set('toolsAndTechnologies')}
              rows={2}
              placeholder="AWS (EC2, S3, Lambda), Docker, Kubernetes, GitHub Actions, Datadog, Figma, Linear"
            />
          </Field>
          <Field label="Soft Skills">
            <Input
              value={data.softSkills}
              onChange={set('softSkills')}
              placeholder="Communication, leadership, mentoring, cross-functional collaboration"
            />
          </Field>
        </Section>

        {/* 6. Education */}
        <Section title="Education">
          <Field label="Degree(s) & Certifications" hint="Institution, degree, field, year. Include relevant certifications.">
            <Textarea
              value={data.education}
              onChange={set('education')}
              rows={3}
              placeholder="BSc Computer Science — University of Lagos, 2019&#10;AWS Certified Solutions Architect — 2022&#10;Google Professional Cloud Developer — 2023"
            />
          </Field>
        </Section>

        {/* 7. Interview prep */}
        <Section title="Interview Preparation" hint="These are the questions interviewers always ask. Answer them here so CoachAI can answer as you.">
          <Field label="Your Top 3 Strengths" hint="Be specific — what do colleagues consistently say you're great at?">
            <Textarea
              value={data.strengths}
              onChange={set('strengths')}
              rows={3}
              placeholder="1. Problem decomposition — I can take a vague brief and break it into clear, executable tasks&#10;2. Reliability — I consistently deliver what I commit to, even when scope creeps&#10;3. Communication — I translate technical complexity into plain language for stakeholders"
            />
          </Field>
          <Field label="Weakness & How You're Improving It" hint="Be honest but show self-awareness and growth.">
            <Textarea
              value={data.weaknesses}
              onChange={set('weaknesses')}
              rows={3}
              placeholder="I used to struggle with delegating — I'd take on too much myself to ensure quality. I've been working on this by documenting my standards clearly and doing structured code reviews rather than doing work myself. My team's autonomy has improved significantly."
            />
          </Field>
          <Field label="Why Are You Leaving Your Current Role?" hint="Keep it positive and forward-looking.">
            <Textarea
              value={data.whyLeavingCurrentRole}
              onChange={set('whyLeavingCurrentRole')}
              rows={2}
              placeholder="I've learned a lot at my current company and I'm proud of what we've built. I'm looking for a role with more scope to lead at the product level and work on problems at larger scale."
            />
          </Field>
          <Field label="Where Do You See Yourself in 5 Years?">
            <Textarea
              value={data.careerGoals}
              onChange={set('careerGoals')}
              rows={2}
              placeholder="In 5 years I want to be leading an engineering organisation — either as an Engineering Manager or a Staff Engineer — shipping products that affect millions of people."
            />
          </Field>
          <Field label="Leadership Experience" hint="Teams led, how you led them, outcomes.">
            <Textarea
              value={data.leadershipExperience}
              onChange={set('leadershipExperience')}
              rows={3}
              placeholder="I've led teams of 3–8 engineers across two roles. At Flutterwave I was the tech lead for the merchant onboarding squad, responsible for sprint planning, architecture decisions, and engineering hiring for the team."
            />
          </Field>
          <Field label="Teamwork / Collaboration Example" hint="A time you worked well with others, especially cross-functionally.">
            <Textarea
              value={data.teamworkExample}
              onChange={set('teamworkExample')}
              rows={3}
              placeholder="Worked closely with Product, Design, and Customer Success to redesign our KYC flow. I facilitated weekly syncs, built a shared Notion workspace for decisions, and made sure engineers understood the business context behind every ticket. We shipped 2 weeks early."
            />
          </Field>
          <Field label="A Time You Failed & What You Learned">
            <Textarea
              value={data.failureAndLesson}
              onChange={set('failureAndLesson')}
              rows={3}
              placeholder="I once pushed a database migration without a rollback plan. It caused 45 minutes of downtime on a Sunday night. I owned it fully, wrote a post-mortem, and introduced a migration checklist that the entire team now uses. No repeat since."
            />
          </Field>
          <Field label="Salary Expectation" hint="Optional — only needed if you want CoachAI to answer compensation questions.">
            <Input
              value={data.salaryExpectation}
              onChange={set('salaryExpectation')}
              placeholder="e.g. £85,000–£100,000 depending on total package"
            />
          </Field>
        </Section>

        {/* 8. Anything else */}
        <Section title="Anything Else" hint="Any other context CoachAI should know to answer as you — hobbies, side projects, unusual career moves, anything.">
          <Textarea
            value={data.additionalContext}
            onChange={set('additionalContext')}
            rows={4}
            placeholder="I built a SaaS tool in my spare time that reached 800 paying users before I sold it. I'm also an open-source contributor — my Redis client library has 2,000+ GitHub stars."
          />
        </Section>

        <div className="flex justify-end pb-10">
          <Button onClick={save} disabled={saving} size="lg">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : saved ? (
              <CheckCircle className="h-4 w-4 mr-2 text-green-400" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saved ? 'Saved' : 'Save Profile'}
          </Button>
        </div>
      </main>
    </div>
  );
}

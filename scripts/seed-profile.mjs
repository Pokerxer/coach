// Run with: node scripts/seed-profile.mjs
// Seeds Jordan Ogene's profile data from resume into Supabase

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role — bypasses RLS
);

const profileData = {
  fullName: 'Jordan Ogene',
  currentTitle: 'Full-Stack JavaScript Developer',
  yearsOfExperience: '5+ years',
  location: 'Abuja, Nigeria',
  linkedin: 'linkedin.com/in/jordan-waldehz',

  currentCompany: 'Wyn City (Cloud Bay Wyn City Ventures)',
  currentResponsibilities:
    '• Architected and deployed a full e-commerce platform on Odoo, reducing average page load time by 40% through asset optimization and lazy loading\n' +
    '• Built and managed a product catalog system with 5,000+ SKUs across 10+ categories, implementing dynamic filtering and SEO-optimized pages that drove a 60% increase in organic search traffic\n' +
    '• Implemented shopping cart, wishlist, and multi-step checkout flow, contributing to a 35% improvement in checkout completion rate\n' +
    '• Engineered a fully responsive mobile-first UI achieving 98% cross-browser compatibility and cutting mobile bounce rate by 25%\n' +
    '• Handled SEO technical setup securing first-page Google rankings for 10+ high-competition local keywords within 3 months\n' +
    '• Managing a live 24/7 production environment handling 500+ monthly product interactions, maintaining 99.9% uptime with zero critical incidents over 3+ years',

  workHistory:
    'Web Designer and Full-Stack Developer — Wyn City (Cloud Bay Wyn City Ventures) | January 2022 – Present | Abuja, Nigeria\n' +
    '• Architected and deployed full e-commerce platform on Odoo with 5,000+ SKU catalog, driving 60% organic traffic growth and 35% checkout completion improvement\n' +
    '• Managing live 24/7 production environment with 99.9% uptime over 3+ years\n\n' +
    'Full-Stack Developer — Kentaz Emporium | 2026 – Present | Remote, Abuja, Nigeria\n' +
    '• Designed full-stack luxury e-commerce and booking platform (3 apps: frontend, backend, admin) with 50+ API routes and 20+ Mongoose models — kentazemporium.com\n' +
    '• Built multi-service booking system with therapist profiles, calendar slot pickers, and Google Calendar integration\n\n' +
    'Full-Stack Developer — DrinksHarbour | 2022 – Present | Remote\n' +
    '• Architected multi-tenant SaaS platform with subdomain-based tenant isolation, centralized product catalog, and AI layer (semantic search, recommendations, sentiment analysis)\n' +
    '• Implemented Stripe subscription tiers (free trial, starter, pro, enterprise) and full vendor lifecycle management\n\n' +
    'Full-Stack Developer — Ball & Boujee | 2025 – Present | Remote, Abuja, Nigeria\n' +
    '• Built premium sports and lifestyle e-commerce platform with dual payment processing (Stripe + Paystack), gift cards, discount codes, offline-capable POS — ballandboujee.com\n\n' +
    'Full-Stack Developer — Swift Professional Solutions Ltd. | 2026 – Present | Remote, Abuja, Nigeria\n' +
    '• Delivered 3-app full-stack platform: Next.js 14 frontend, Node.js/Express REST API (JWT auth, 10+ endpoints), and Next.js admin CMS — swiftpsl.com\n\n' +
    'Full-Stack Developer — Christy\'s Beauty Spa | 2026 – Present | Remote, Abuja, Nigeria\n' +
    '• Built multi-step spa booking wizard supporting 48+ services across 7 categories with real-time pricing, 30% deposit logic, and 3 payment methods — christy-empire.vercel.app\n\n' +
    'Front-End Developer — IXNote Services Nig. Ltd. | March 2020 – December 2021 | Plateau State, Nigeria\n' +
    '• Built and maintained 30+ reusable React components, reducing UI development time by 40% across 5+ client projects\n' +
    '• Conducted code reviews enforcing team standards, reducing post-deployment bug reports by 35% over 6 months\n' +
    '• Contributed across the full SDLC, shipping 8+ production features with zero rollbacks in the final 6 months',

  keyAchievements:
    '• 60% increase in organic search traffic for a 5,000+ SKU e-commerce platform through SEO-optimized architecture\n' +
    '• 40% reduction in page load time through asset optimization and lazy loading\n' +
    '• 35% improvement in checkout completion rate through UX and flow optimization\n' +
    '• 99.9% uptime over 3+ years managing a live 24/7 production environment\n' +
    '• 30+ reusable React components built and maintained, reducing UI development time by 40% across 5+ client projects\n' +
    '• 35% reduction in post-deployment bug reports through systematic code review\n' +
    '• 30% improvement in data retrieval speed through optimized database queries\n' +
    '• 25% reduction in mobile bounce rate through mobile-first UI engineering\n' +
    '• First-page Google rankings for 10+ high-competition local keywords within 3 months\n' +
    '• 5 live production applications actively deployed and managed simultaneously',

  greatestAchievement:
    'Building DrinksHarbour end-to-end — a full multi-tenant SaaS platform I architected from scratch. I designed subdomain-based tenant isolation, a centralized product catalog covering 200+ beverage types with ABV, volume, origin, and flavor note fields, full vendor lifecycle management (pricelists, POs, bills, returns, inventory, 3-way matching), Stripe subscription tiers, and an AI layer with semantic search (sentence-transformers), personalized recommendations, and sentiment analysis. I built it, deployed it, and still manage it today. It is the clearest proof I can own the full complexity of a production-grade SaaS product independently.',

  biggestChallenge:
    'Architecting the multi-tenant data model for DrinksHarbour. Getting subdomain-based tenant isolation right while keeping a centralized product catalog as a single source of truth — with tenant-specific SubProducts that each had individual pricing, stock, and variants — required rethinking my Mongoose schemas multiple times. I worked through it methodically: drew the data model on paper, identified edge cases, tested each layer before moving on, and shipped it incrementally. The final architecture is clean and has held up without major issues.',

  technicalSkills:
    'JavaScript (ES6+), TypeScript, React.js, Next.js 15 (App Router), Node.js, Express.js, Python, RESTful API design, Redux Toolkit, RTK Query, Zustand, React Hook Form, Zod, HTML5, CSS3, Tailwind CSS v4, SASS, Material UI, Framer Motion, shadcn/ui, NextAuth.js, JWT Authentication, Socket.io, Semantic Search (sentence-transformers), Recommendation Systems, Sentiment Analysis',

  toolsAndTechnologies:
    'MongoDB (Mongoose ODM), SQL, Firebase Firestore, Redis, IndexedDB, Git, GitHub, Vercel, Netlify, Cloudinary (AI Auto-Tagging), Turborepo, PWA, Google OAuth, Google Calendar API, Stripe (subscriptions and checkout), Paystack, Nodemailer, Firebase, Postman, VS Code',

  softSkills:
    'End-to-end project ownership, technical self-direction, production system management, code review, cross-functional collaboration, client communication, deadline discipline',

  education:
    'Bachelor of Science in Computer Science — Second Class Upper (2:1), GPA: 4.1/5.0\nUniversity of Jos, Plateau State | 2018 – 2023\nRelevant Coursework: Operating Systems, Object-Oriented Programming, Database Design and Management (SQL), Web Development, Organisation of Programming Languages',

  strengths:
    '1. Full ownership mentality — I architect, build, deploy, and manage my own projects end-to-end. I don\'t just write code; I own the product.\n' +
    '2. Shipping speed — I have 5+ live production applications running simultaneously, all built and deployed by me. I know how to move from zero to production fast.\n' +
    '3. Breadth across the stack — equally comfortable on frontend (React, Next.js, Tailwind) and backend (Node.js, Express, MongoDB), which means I can unblock myself and solve the full problem.',

  weaknesses:
    'I tend to over-engineer solutions — I\'ll spend extra time getting the architecture perfect even when a simpler solution would ship faster. I\'ve been actively working on this by timeboxing design decisions: I give myself a fixed window to architect, then commit and ship. It has made me meaningfully faster without sacrificing code quality.',

  whyLeavingCurrentRole:
    "I've built a strong foundation through independent projects and client work, proving I can own complex systems end-to-end. I'm now looking to join a team where I can collaborate with other strong engineers, tackle larger-scale distributed problems, and grow into a senior or lead engineering role with more impact.",

  careerGoals:
    'In 5 years I want to be a senior or lead full-stack engineer at a product company — ideally working on developer tools, fintech, or SaaS products. I want to set technical direction, mentor junior engineers, and ship products that affect a large number of users.',

  leadershipExperience:
    'At IXNote Services I led code reviews across a 4-person dev team, enforcing engineering standards that reduced post-deployment bug reports by 35%. In my freelance and personal projects I am the sole technical decision-maker — I make every architecture, tooling, and infrastructure decision across all 5+ production applications I manage. That is effectively full technical leadership, even without the formal title.',

  teamworkExample:
    'At IXNote Services I collaborated closely with design and content teams to deliver 10+ web pages per sprint, consistently meeting deadlines while maintaining visual consistency across all client-facing platforms. I contributed across the full SDLC — from requirements gathering to deployment — helping ship 8+ production features with zero rollbacks in my final 6 months.',

  failureAndLesson:
    'Early in my career I underestimated the complexity of a database integration task and gave an overconfident delivery timeline. I missed it by about a week, which created pressure across the team. That taught me to break tasks down much more carefully before committing to estimates, and to surface risks early rather than hoping they would resolve. I have been much more deliberate about estimation since then.',

  salaryExpectation:
    '$80,000–$150,000 annually (or $25–$50/hour for contract). Flexible on range for the right role with strong growth potential. Currently earning local rates in Nigeria and actively targeting international compensation. Values equity and learning opportunities as part of total package.',

  additionalContext:
    'DRINKSHARBOUR TECHNICAL DEPTH (for architecture/system design questions):\n' +
    'Tenant isolation: subdomain-based — each vendor gets their own subdomain (vendor-a.drinksharbour.com). Middleware reads the subdomain from the request, looks up the tenant, and scopes all queries to that tenant ID. No data leaks between tenants.\n' +
    'Data model: two-layer architecture — immutable master Product (shared catalog, single source of truth) and tenant-specific SubProduct (individual pricing, stock, variants per vendor). This avoids duplicating catalog data while giving each vendor full control over their own pricing and inventory.\n' +
    'Data integrity: Mongoose pre-delete hooks on the Product model check for SubProducts pointing to that Product ID before allowing deletion — prevents orphaned SubProducts. Pre-update hooks on SubProduct validate that the tenant ID matches before the write lands.\n' +
    'Concurrency: current implementation does not use transactions or optimistic locking. MongoDB serializes writes at the document level so data won\'t corrupt, but last-write-wins applies. For concurrent vendor updates to the same SubProduct, the last write overwrites earlier ones. Production fix would be optimistic locking — add a version field to SubProduct, increment on each update, and reject the write if the incoming version doesn\'t match the stored one. Client retries with fresh data.\n\n' +
    'WORK LOCATION & VISA:\n' +
    'Based in Abuja, Nigeria. Requires 100% remote work with a strong remote-first culture. Not interested in Nigeria-based companies. Would consider hybrid or on-site only if the company provides relocation support or regular travel arrangements. Needs visa sponsorship for US or Europe-based roles.\n\n' +
    'COMPANY CULTURE PREFERENCES:\n' +
    'Seeking a tech-first company where software is the core product, not just a supporting tool. Wants a stable, structured environment with clear processes — not chaotic early-stage. Prefers small to medium teams where individual contributors have real ownership and autonomy. Values being given clear specs and then having the freedom to execute. Looking to learn cloud computing (AWS) and expand infrastructure skills. Long-term goal is to start own company, so wants exposure to how successful tech companies operate.\n\n' +
    'ROLE PREFERENCES:\n' +
    'Full-Stack JavaScript Developer with 5+ years experience in React, Next.js, Node.js, Express, and MongoDB. Leans toward front-end creative work — building polished UIs and designing user experiences — while maintaining back-end involvement. Strong in state management (Redux) and modern front-end practices. Wants to BUILD NEW FEATURES constantly: new pages, new designs, new user experiences. Open to roles from Junior to Senior Full-Stack Developer at tech-first companies.\n\n' +
    'LIVE PROJECTS:\n' +
    'I have 5 live, actively managed production applications: kentazemporium.com, drinksharbour.com, ballandboujee.com, swiftpsl.com, and christy-empire.vercel.app — real client projects I built from scratch and continue to maintain. GitHub: github.com/Pokerxer. Portfolio: jrwaldehz.dev. Fluent in English, beginner Spanish.',
};

async function seed() {
  // Get all user IDs from profiles (there should only be one — yours)
  const { data: profiles, error: fetchError } = await supabase
    .from('profiles')
    .select('id');

  if (fetchError) {
    console.error('Failed to fetch profiles:', fetchError.message);
    process.exit(1);
  }

  if (!profiles || profiles.length === 0) {
    console.error('No profiles found. Make sure you have signed in at least once.');
    process.exit(1);
  }

  // If multiple, update them all (but there should only be one)
  for (const profile of profiles) {
    const { error } = await supabase
      .from('profiles')
      .update({ profile_data: profileData })
      .eq('id', profile.id);

    if (error) {
      console.error(`Failed to update profile ${profile.id}:`, error.message);
    } else {
      console.log(`✓ Profile seeded for user ${profile.id}`);
    }
  }

  console.log('Done! Visit /profile in the app to review and edit.');
}

seed();

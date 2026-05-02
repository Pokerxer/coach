import axios from 'axios';
import * as cheerio from 'cheerio';

// ── Selectors tried in priority order ────────────────────────────────────────
const JOB_SELECTORS = [
  '[class*="job-description"]',
  '[class*="jobDescription"]',
  '[class*="jobDetails"]',
  '[class*="job_description"]',
  '[id*="job-description"]',
  '[id*="jobDescription"]',
  '[data-automation="jobAdDetails"]',       // Seek
  '.show-more-less-html__markup',           // LinkedIn
  '[class*="description__text"]',           // LinkedIn fallback
  '.jobsearch-JobComponent-description',    // Indeed
  '.jobsearch-jobDescriptionText',          // Indeed alt
  '#jobDescriptionText',                    // Indeed alt
  '[data-testid="job-description"]',        // Workday, Lever variants
  '[data-testid="jobDescriptionSection"]',
  '.posting-description',                   // Lever
  '.job-post__description',
  '.job-post-details',
  'main article',
  'article',
  'main',
  '.content',
];

// ── Noise tags to strip before extracting text ────────────────────────────────
const NOISE_TAGS = 'script, style, nav, header, footer, iframe, noscript, aside, [role="navigation"], [role="banner"], [aria-label="Apply"], button, form';

// ── Clean up extracted text ───────────────────────────────────────────────────
function cleanText(raw: string): string {
  return raw
    .replace(/\s{2,}/g, ' ')        // collapse whitespace
    .replace(/\n{3,}/g, '\n\n')     // max 2 blank lines
    .replace(/[\r\t]/g, ' ')
    .trim()
    .slice(0, 8000);                 // cap at 8k chars for LLM context
}

// ── Extract from HTML string (Cheerio) ───────────────────────────────────────
function extractFromHtml(html: string): string {
  const $ = cheerio.load(html);
  $(NOISE_TAGS).remove();

  for (const sel of JOB_SELECTORS) {
    const el = $(sel).first();
    const text = el.text().trim();
    if (text.length > 300) return cleanText(text);
  }

  // Fallback: whole body
  return cleanText($('body').text());
}

// ── Static fetch (Axios + Cheerio) ───────────────────────────────────────────
async function scrapeStatic(url: string): Promise<string> {
  const { data: html } = await axios.get(url, {
    timeout: 12000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  return extractFromHtml(html);
}

// ── Dynamic fetch (Playwright + Chromium) ────────────────────────────────────
// Only runs when playwright-core is installed. Falls back to static otherwise.
async function scrapeDynamic(url: string): Promise<string> {
  // Dynamic import so the app doesn't break if playwright isn't installed yet
  const { chromium } = await import('playwright-core');

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  await page.setExtraHTTPHeaders({
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Wait for the job description to appear (best-effort)
  try {
    await page.waitForSelector(
      JOB_SELECTORS.slice(0, 8).join(', '),
      { timeout: 6000 }
    );
  } catch { /* fine — still grab what's there */ }

  const html = await page.content();
  await browser.close();

  return extractFromHtml(html);
}

// ── Domains that are known SPAs / require JS rendering ───────────────────────
const JS_HEAVY_DOMAINS = [
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'workday.com',
  'myworkdayjobs.com',
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'rippling.com',
  'smartrecruiters.com',
  'icims.com',
  'taleo.net',
  'successfactors',
  'ziprecruiter.com',
  'monster.com',
  'seek.com',
  'jobvite.com',
  'breezy.hr',
];

function needsDynamicScrape(url: string): boolean {
  const lower = url.toLowerCase();
  return JS_HEAVY_DOMAINS.some((d) => lower.includes(d));
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function scrapeJobDescription(url: string): Promise<string> {
  if (needsDynamicScrape(url)) {
    try {
      const result = await scrapeDynamic(url);
      if (result.length > 300) return result;
      // If dynamic gave little content, fall through to static
    } catch (err: any) {
      // playwright not installed → fall back gracefully
      if (!err?.message?.includes('Cannot find module')) {
        console.error('[scraper] playwright error:', err?.message);
      }
    }
  }

  // Static path (fast, no browser needed)
  return scrapeStatic(url);
}

import { NextRequest, NextResponse } from 'next/server';
import { scrapeJobDescription } from '@/lib/scraper';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

    const description = await scrapeJobDescription(url);
    return NextResponse.json({ description });
  } catch (err) {
    console.error('[scrape-job]', err);
    return NextResponse.json({ error: 'Failed to scrape job description' }, { status: 500 });
  }
}

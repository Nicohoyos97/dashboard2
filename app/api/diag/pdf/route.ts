// TEMPORARY — diagnosing the PDF render on Vercel. Preview deployments only;
// it reads no client data and is removed with the fix.
import { existsSync } from 'node:fs';

import puppeteer from 'puppeteer-core';

import { reportAssets } from '@/lib/reports/report-assets';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Step = { step: string; ok: boolean; detail: string };

async function attempt(step: string, run: () => Promise<string>): Promise<Step> {
  try {
    return { step, ok: true, detail: await run() };
  } catch (error) {
    return { step, ok: false, detail: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 600) : String(error) };
  }
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') return new Response(null, { status: 404 });
  const steps: Step[] = [];
  steps.push(await attempt('node', async () => `${process.version} ${process.platform} ${process.arch} cwd=${process.cwd()}`));
  steps.push(await attempt('assets', async () => Object.keys(await reportAssets()).join(',')));
  let executablePath = '';
  let args: string[] = [];
  steps.push(
    await attempt('chromium', async () => {
      const chromium = (await import('@sparticuz/chromium')).default;
      args = chromium.args;
      executablePath = await chromium.executablePath();
      return `${executablePath} exists=${existsSync(executablePath)}`;
    }),
  );
  steps.push(
    await attempt('launch+pdf', async () => {
      const browser = await puppeteer.launch({ args, executablePath, headless: true });
      try {
        const page = await browser.newPage();
        await page.setContent('<p>diagnostic</p>');
        const pdf = await page.pdf({ format: 'letter' });
        return `pdf bytes=${pdf.length}`;
      } finally {
        await browser.close().catch(() => undefined);
      }
    }),
  );
  return Response.json(steps, { headers: { 'Cache-Control': 'no-store' } });
}

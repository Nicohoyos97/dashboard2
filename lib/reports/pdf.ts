// Printing a client report: Chromium renders the KILL-PDF document, pdf-lib
// clears the two running bands the cover must not show.
//
// The running header and footer come from Puppeteer's templates because only
// Chromium knows the final page count — "Page 2 of 4" spans the whole document,
// cover included. Chromium prints those templates on every page, so afterwards
// the cover's header and footer bands and the first statement page's header
// band are painted over. Those bands sit in the page margin, so nothing is
// covered but the templates themselves.
import { existsSync } from 'node:fs';

import { PDFDocument, rgb } from 'pdf-lib';
import puppeteer, { type Browser } from 'puppeteer-core';
import 'server-only';

import { FIRM, PAGE_BAND_PT, PAGE_MARGIN } from './brand';
import {
  type ReportHtmlInput,
  documentTitle,
  footerTemplate,
  headerTemplate,
  reportHtml,
} from './report-html';
import type { ReportRow } from './types';

// US Letter minus the page bands, at CSS 96dpi — the box Chromium lays a page
// of content into. Used only to work out how many pages the cover takes.
const CONTENT_HEIGHT_PX = (11 - 0.62 - 0.55) * 96;
const CONTENT_WIDTH_PX = Math.round((8.5 - 1.6) * 96);
const RENDER_TIMEOUT_MS = 30_000;

const LOCAL_CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export class ReportRenderError extends Error {
  readonly code = 'report_render_failed' as const;

  constructor(reason: string) {
    super(reason);
    this.name = 'ReportRenderError';
  }
}

function serverless(): boolean {
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_VERSION ?? process.env.VERCEL);
}

async function launch(): Promise<Browser> {
  const configured = process.env.CHROME_EXECUTABLE_PATH;
  if (configured) return puppeteer.launch({ executablePath: configured, headless: true });

  if (serverless()) {
    // Imported lazily: the binary is ~50 MB and local development never needs it.
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const local = LOCAL_CHROME.find((path) => existsSync(path));
  if (!local) throw new ReportRenderError('no_local_browser');
  return puppeteer.launch({ executablePath: local, headless: true });
}

/** How many pages the cover letter takes, measured in print layout. */
async function coverPageCount(page: Awaited<ReturnType<Browser['newPage']>>): Promise<number> {
  try {
    return await page.evaluate((perPage: number) => {
      const el = document.querySelector('.cover');
      if (!(el instanceof HTMLElement)) return 1;
      return Math.max(1, Math.ceil(el.getBoundingClientRect().height / perPage - 0.02));
    }, CONTENT_HEIGHT_PX);
  } catch {
    return 1;
  }
}

async function finish(bytes: Uint8Array, coverPages: number, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  doc.setTitle(title);
  doc.setCreator(FIRM.name);
  doc.setProducer(FIRM.name);
  const white = rgb(1, 1, 1);
  doc.getPages().forEach((page, index) => {
    const { width, height } = page.getSize();
    const onCover = index < coverPages;
    // The first statement page carries its own full header in the flow.
    if (onCover || index === coverPages) {
      page.drawRectangle({
        x: 0,
        y: height - PAGE_BAND_PT.top,
        width,
        height: PAGE_BAND_PT.top,
        color: white,
      });
    }
    if (onCover) {
      page.drawRectangle({ x: 0, y: 0, width, height: PAGE_BAND_PT.bottom, color: white });
    }
  });
  return doc.save();
}

export async function statementPdf(input: ReportHtmlInput): Promise<Uint8Array> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);
    await page.setViewport({ width: CONTENT_WIDTH_PX, height: Math.round(CONTENT_HEIGHT_PX) });
    await page.emulateMediaType('print');
    await page.setContent(reportHtml(input), { waitUntil: 'load' });
    // Archivo is inlined, but the faces still have to be parsed before layout.
    await page.evaluate(() => document.fonts.ready.then(() => undefined));

    const covers = await coverPageCount(page);
    const printed = await page.pdf({
      format: 'letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: headerTemplate(input),
      footerTemplate: footerTemplate(input),
      margin: PAGE_MARGIN,
    });
    return finish(new Uint8Array(printed), covers, documentTitle(input));
  } catch (error) {
    if (error instanceof ReportRenderError) throw error;
    throw new ReportRenderError(error instanceof Error ? error.name : 'unknown');
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export function statementPdfFilename(report: ReportRow): string {
  const type = report.reportType === 'balance_sheet' ? 'balance-sheet' : 'profit-and-loss';
  return `${type}_${report.periodStart}_${report.periodEnd}.pdf`;
}

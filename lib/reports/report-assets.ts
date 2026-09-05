// Brand assets for the PDF reports, inlined as data URIs.
//
// KILL-PDF.md points at hoyosbaker.com/assets for the logo and signature so
// emails always resolve. A PDF is rendered inside a serverless function with no
// guarantee of egress, and the signature URL currently 404s, so the report
// carries its own copies: a render must never lose the letterhead or the
// signature to someone else's uptime. Keep these in step with the public files.
//
// The Archivo subsets are the same variable-font woff2 Google Fonts serves.
// @sparticuz/chromium ships without system fonts, so the typeface has to travel
// with the document.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import 'server-only';

const DIR = path.join(process.cwd(), 'lib', 'reports', 'assets');

const FILES = {
  logo: { file: 'hoyos-baker-logo.png', mime: 'image/png' },
  signature: { file: 'nicolas-hoyos-signature.png', mime: 'image/png' },
  fontLatin: { file: 'archivo-latin.woff2', mime: 'font/woff2' },
  fontLatinExt: { file: 'archivo-latin-ext.woff2', mime: 'font/woff2' },
} as const;

export type ReportAssetKey = keyof typeof FILES;
export type ReportAssets = Record<ReportAssetKey, string>;

let cached: Promise<ReportAssets> | null = null;

async function load(): Promise<ReportAssets> {
  const entries = await Promise.all(
    (Object.keys(FILES) as ReportAssetKey[]).map(async (key) => {
      const { file, mime } = FILES[key];
      const bytes = await readFile(path.join(DIR, file));
      return [key, `data:${mime};base64,${bytes.toString('base64')}`] as const;
    }),
  );
  return Object.fromEntries(entries) as ReportAssets;
}

/** Read once per process — the files never change between renders. */
export function reportAssets(): Promise<ReportAssets> {
  cached ??= load().catch((error) => {
    // Do not cache a failure: a transient read must not poison every later render.
    cached = null;
    throw error;
  });
  return cached;
}

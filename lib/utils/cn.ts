import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The type scale in app/globals.css names its sizes by role (`text-ui`,
// `text-display`, …). tailwind-merge reads an unknown `text-*` as a colour, so
// without this `cn('text-ui text-ink')` would keep only the colour and the
// element would silently fall back to the inherited size.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['micro', 'caption', 'small', 'ui', 'body', 'title', 'heading', 'stat', 'display', 'hero'],
    },
  },
});

// Merge conditional class names, de-duplicating conflicting Tailwind utilities.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

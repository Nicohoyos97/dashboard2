// Font loading via next/font/google. Inter is the single typeface for every
// surface (INITIAL_PROMPT.md §6); globals.css consumes the CSS variable. Variable
// font, so no explicit weights are needed.
import { Inter } from 'next/font/google';

export const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

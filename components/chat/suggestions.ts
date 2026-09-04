// Page-specific suggested questions (spec §7): i18n keys under `Nick`,
// resolved by SuggestedQuestions. The keys stay here so the server pages and
// the panel agree without importing React.
import type { NickPage } from '@/lib/ai/nick/types';

export const SUGGESTIONS: Record<NickPage, readonly string[]> = {
  overview: ['s_overview_1', 's_overview_2', 's_overview_3', 's_overview_4'],
  profit_and_loss: ['s_pnl_1', 's_pnl_2', 's_pnl_3', 's_pnl_4', 's_pnl_5', 's_pnl_6'],
  balance_sheet: ['s_bs_1', 's_bs_2', 's_bs_3', 's_bs_4', 's_bs_5'],
  // Nick's expense tool reads the P&L breakdown, so the prompts stay on what it can cite.
  expenses: ['s_exp_1', 's_exp_2', 's_exp_3', 's_exp_4'],
  income_tax: ['s_itax_1', 's_itax_2', 's_itax_3'],
  sales_tax: ['s_stax_1', 's_stax_2', 's_stax_3'],
  reports: ['s_chat_3', 's_chat_1'],
  chat: ['s_chat_1', 's_chat_2', 's_chat_3', 's_chat_4'],
};

export const LINE_SUGGESTIONS = ['s_line_1', 's_line_2'] as const;

// Runtime-safe reminder vocabulary shared by the client form and the server
// actions. Keep constants out of a `use server` module: Next transforms every
// runtime export there into a server reference.
export const REMINDER_TYPES = [
  'payroll_date',
  'payroll_tax_deposit',
  'sales_tax_deadline',
  'estimated_income_tax',
  'loan_payment',
  'renewal',
  'custom',
] as const;

export const REMINDER_STORED_STATUSES = ['upcoming', 'paid', 'completed', 'needs_confirmation'] as const;

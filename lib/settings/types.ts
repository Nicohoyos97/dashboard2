// Shared contracts for the Settings mutations. Kept out of the 'use server'
// module because a Server Actions file may only export async functions — the
// constants and types live here so both the forms and the actions can import
// them without pulling a client bundle into the server boundary.

export const NOTIFICATION_CHANNELS = [
  'reminders',
  'new_reports',
  'tax_deadlines',
  'document_activity',
  'email_digest',
] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationPreferences = Record<NotificationChannel, boolean>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  reminders: true,
  new_reports: true,
  tax_deadlines: true,
  document_activity: false,
  email_digest: false,
};

export const ACCOUNT_REQUEST_KINDS = ['data_export', 'account_deletion'] as const;
export type AccountRequestKind = (typeof ACCOUNT_REQUEST_KINDS)[number];

export type SaveResult = { ok: true } | { ok: false; error: string };

'use client';

// Shared auth form primitives (design: login-v2). Label-above pill inputs, a
// password field with show/hide, the signup strength meter, and inline icons.
// Used by AuthForm, ResetPasswordForm, and ForgotPasswordForm so styling stays
// in sync. Input ids are preserved (#email, #password, …) — the e2e relies on them.
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

import { passwordStrength } from '@/lib/auth/schemas';

export const fieldClass =
  'h-12 w-full rounded-xl border border-line bg-card px-4 text-[14px] text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/60 hover:border-muted-ink/60 focus:border-blue focus:ring-4 focus:ring-blue/10 disabled:cursor-not-allowed disabled:opacity-60';

export function Field({
  id,
  label,
  action,
  error,
  children,
}: {
  id: string;
  label: string;
  action?: React.ReactNode;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-ink text-[14px] font-semibold">
          {label}
        </label>
        {action}
      </div>
      {children}
      {error && (
        <p role="alert" className="mt-1.5 px-1 text-[12.5px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordField({
  id,
  label,
  action,
  autoComplete,
  error,
  registration,
}: {
  id: string;
  label: string;
  action?: React.ReactNode;
  autoComplete: string;
  error?: string | undefined;
  registration: UseFormRegisterReturn;
}) {
  const t = useTranslations('Auth');
  const [show, setShow] = useState(false);
  return (
    <Field id={id} label={label} action={action} error={error}>
      <div className="relative">
        <LockKeyhole className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2" aria-hidden="true" />
        <input
          id={id}
          type={show ? 'text' : 'password'}
          placeholder="••••••••"
          autoComplete={autoComplete}
          className={`${fieldClass} pr-14 pl-11`}
          {...registration}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? t('hidePassword') : t('showPassword')}
          aria-pressed={show}
          className="text-muted-foreground hover:bg-paper hover:text-foreground absolute top-1/2 right-4 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full transition"
        >
          {show ? <EyeOff className="size-[18px]" aria-hidden="true" /> : <Eye className="size-[18px]" aria-hidden="true" />}
        </button>
      </div>
    </Field>
  );
}

const STRENGTH_KEYS = [
  'strengthTooShort',
  'strengthWeak',
  'strengthFair',
  'strengthGood',
  'strengthStrong',
] as const;
const SEG_COLORS = ['', 'bg-danger', 'bg-warning', 'bg-blue', 'bg-success'];

export function StrengthMeter({ value }: { value: string }) {
  const t = useTranslations('Auth');
  const strength = passwordStrength(value);
  return (
    <div className="-mt-1 mb-4 px-1">
      <div className="grid grid-cols-4 gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 rounded-sm transition-colors ${i < strength ? SEG_COLORS[strength] : 'bg-line'}`}
          />
        ))}
      </div>
      <div className="text-muted-foreground mt-1.5 flex justify-between text-[11px] font-medium tracking-[0.08em] uppercase">
        <span>{t('strengthLabel')}</span>
        <b className="text-foreground font-semibold">
          {t(STRENGTH_KEYS[strength] ?? 'strengthTooShort')}
        </b>
      </div>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-4 rounded-[12px] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.06)] px-4 py-3 text-[13.5px] text-danger"
    >
      {message}
    </div>
  );
}

export function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

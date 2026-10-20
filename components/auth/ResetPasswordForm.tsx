'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { updatePassword } from '@/lib/auth/actions';
import { passwordIssue } from '@/lib/auth/rules';
import type { ResetPasswordValues } from '@/lib/auth/schemas';

import { ErrorBanner, PasswordField, Spinner, StrengthMeter, useIssueMessage } from './fields';

export function ResetPasswordForm() {
  const t = useTranslations('Auth');
  const issueMessage = useIssueMessage();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordValues>({ mode: 'onBlur' });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      // updatePassword redirects to /dashboard on success; only errors return.
      const res = await updatePassword(values.password);
      if (!res.ok) setError(res.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      {error && <ErrorBanner message={error} />}

      <PasswordField
        id="password"
        label={t('newPassword')}
        autoComplete="new-password"
        error={errors.password?.message}
        registration={register('password', { validate: (value) => issueMessage(passwordIssue(value)) })}
      />
      <StrengthMeter value={watch('password') ?? ''} />

      <PasswordField
        id="confirmPassword"
        label={t('confirmPassword')}
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        registration={register('confirmPassword', {
          validate: (value, values) =>
            issueMessage(value.length === 0 ? 'confirmRequired' : value === values.password ? null : 'passwordMismatch'),
        })}
      />

      <button
        type="submit"
        disabled={isPending}
        className="bg-blue hover:bg-blue-hover mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-body font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <Spinner />
            {t('updating')}
          </>
        ) : (
          t('updatePassword')
        )}
      </button>
    </form>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { updatePassword } from '@/lib/auth/actions';
import { type ResetPasswordValues, resetPasswordSchema } from '@/lib/auth/schemas';

import { ErrorBanner, PasswordField, Spinner, StrengthMeter } from './fields';

export function ResetPasswordForm() {
  const t = useTranslations('Auth');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema), mode: 'onBlur' });

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
        registration={register('password')}
      />
      <StrengthMeter value={watch('password') ?? ''} />

      <PasswordField
        id="confirmPassword"
        label={t('confirmPassword')}
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        registration={register('confirmPassword')}
      />

      <button
        type="submit"
        disabled={isPending}
        className="bg-blue hover:bg-blue-soft mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
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

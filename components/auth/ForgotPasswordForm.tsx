'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Link } from '@/i18n/navigation';
import { requestPasswordReset } from '@/lib/auth/actions';
import { type ForgotPasswordValues, forgotPasswordSchema } from '@/lib/auth/schemas';

import { ErrorBanner, Field, Spinner, fieldClass } from './fields';

export function ForgotPasswordForm() {
  const t = useTranslations('Auth');
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onBlur',
  });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const res = await requestPasswordReset(values.email);
      if (res.ok) setSent(true);
      else setError(res.error);
    });
  });

  if (sent) {
    return (
      <div className="border-line bg-paper rounded-[16px] border p-6 text-center">
        <h2 className="text-ink text-lg font-bold">{t('checkEmailTitle')}</h2>
        <p className="text-muted-foreground mt-2 text-[14.5px] leading-relaxed">
          {t('forgotSentBody')}
        </p>
        <Link
          href="/signin"
          className="text-foreground hover:text-blue mt-4 inline-block text-[14px] font-semibold"
        >
          {t('backToSignIn')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      {error && <ErrorBanner message={error} />}

      <Field id="email" label={t('emailLabel')} error={errors.email?.message}>
        <input
          id="email"
          type="email"
          placeholder={t('emailPlaceholder')}
          autoComplete="email"
          className={fieldClass}
          {...register('email')}
        />
      </Field>

      <button
        type="submit"
        disabled={isPending}
        className="bg-blue hover:bg-blue-soft mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <Spinner />
            {t('sending')}
          </>
        ) : (
          t('sendResetLink')
        )}
      </button>
    </form>
  );
}

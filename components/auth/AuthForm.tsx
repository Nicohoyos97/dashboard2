'use client';

import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Link } from '@/i18n/navigation';
import { signInWithPassword } from '@/lib/auth/actions';
import { emailIssue } from '@/lib/auth/rules';
import type { SignInValues } from '@/lib/auth/schemas';

import { Field, PasswordField, Spinner, fieldClass, useIssueMessage } from './fields';

export function AuthForm({
  redirectTo,
  onError,
}: {
  redirectTo?: string | undefined;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations('Auth');
  const issueMessage = useIssueMessage();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInValues>({
    mode: 'onBlur',
    defaultValues: { remember: true },
  });

  const onSubmit = handleSubmit((values) => {
    onError(null);
    startTransition(async () => {
      const result = await signInWithPassword(
        { email: values.email, password: values.password, remember: values.remember ?? true },
        redirectTo,
      );
      // signInWithPassword redirects on success and never returns here.
      if (!result.ok) onError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      <Field id="email" label={t('emailLabel')} error={errors.email?.message}>
        <div className="relative">
          <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2" aria-hidden="true" />
          <input
            id="email"
            type="email"
            placeholder={t('emailPlaceholder')}
            autoComplete="email"
            className={`${fieldClass} pl-11`}
            {...register('email', { validate: (value) => issueMessage(emailIssue(value)) })}
          />
        </div>
      </Field>

      <PasswordField
        id="password"
        label={t('passwordLabel')}
        autoComplete="current-password"
        error={errors.password?.message}
        registration={register('password', { validate: (value) => issueMessage(value.length > 0 ? null : 'passwordRequired') })}
      />

      <div className="mb-4 flex items-center justify-between gap-4 text-small">
        <label className="text-muted-foreground flex min-h-11 cursor-pointer items-center gap-2.5 font-medium">
          <input
            type="checkbox"
            className="border-input text-link focus-visible:ring-brand/35 size-4 rounded border bg-card accent-brand outline-none focus-visible:ring-3"
            {...register('remember')}
          />
          <span>{t('keepSignedIn')}</span>
        </label>
        <Link
          href="/forgot-password"
          className="text-link focus-visible:ring-brand/35 rounded-sm font-semibold whitespace-nowrap outline-none hover:underline focus-visible:ring-3"
        >
          {t('forgotPassword')}
        </Link>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="bg-blue hover:bg-blue-hover focus-visible:ring-brand/35 mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-body font-semibold text-white shadow-sm outline-none transition active:scale-[0.99] focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <Spinner />
            {t('signingIn')}
          </>
        ) : (
          t('signIn')
        )}
      </button>
    </form>
  );
}

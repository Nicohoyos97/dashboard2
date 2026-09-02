'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { type Resolver, useForm } from 'react-hook-form';

import { Link } from '@/i18n/navigation';
import { signInWithPassword, signUpWithPassword } from '@/lib/auth/actions';
import { signInSchema, signUpSchema } from '@/lib/auth/schemas';

import { Field, PasswordField, Spinner, StrengthMeter, fieldClass } from './fields';

type Mode = 'signin' | 'signup';

type FormValues = {
  firstName?: string;
  lastName?: string;
  email: string;
  password: string;
};

export function AuthForm({
  mode,
  redirectTo,
  onError,
}: {
  mode: Mode;
  redirectTo?: string | undefined;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations('Auth');
  const isSignup = mode === 'signup';
  const [isPending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(isSignup ? signUpSchema : signInSchema) as Resolver<FormValues>,
    mode: 'onBlur',
  });

  const onSubmit = handleSubmit((values) => {
    onError(null);
    startTransition(async () => {
      const result = isSignup
        ? await signUpWithPassword({
            firstName: values.firstName ?? '',
            lastName: values.lastName ?? '',
            email: values.email,
            password: values.password,
          })
        : await signInWithPassword({ email: values.email, password: values.password }, redirectTo);

      // signInWithPassword redirects on success and never returns here.
      if (result.ok && result.needsConfirmation) setConfirmation(true);
      else if (!result.ok) onError(result.error);
    });
  });

  if (confirmation) {
    return (
      <div className="border-line bg-paper mt-6 rounded-[16px] border p-6 text-center">
        <h2 className="text-ink text-lg font-bold">{t('checkEmailTitle')}</h2>
        <p className="text-muted-foreground mt-2 text-[14.5px] leading-relaxed">
          {t('checkEmailBody')}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col">
      {isSignup && (
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Field id="firstName" label={t('firstName')} error={errors.firstName?.message}>
            <input
              id="firstName"
              placeholder={t('firstNamePlaceholder')}
              autoComplete="given-name"
              className={fieldClass}
              {...register('firstName')}
            />
          </Field>
          <Field id="lastName" label={t('lastName')} error={errors.lastName?.message}>
            <input
              id="lastName"
              placeholder={t('lastNamePlaceholder')}
              autoComplete="family-name"
              className={fieldClass}
              {...register('lastName')}
            />
          </Field>
        </div>
      )}

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

      <PasswordField
        id="password"
        label={t('passwordLabel')}
        autoComplete={isSignup ? 'new-password' : 'current-password'}
        error={errors.password?.message}
        registration={register('password')}
        action={
          isSignup ? undefined : (
            <Link
              href="/forgot-password"
              className="text-blue text-[13px] font-semibold hover:underline"
            >
              {t('forgotPassword')}
            </Link>
          )
        }
      />

      {isSignup && <StrengthMeter value={watch('password') ?? ''} />}

      <button
        type="submit"
        disabled={isPending}
        className="bg-blue hover:bg-blue-soft mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <Spinner />
            {isSignup ? t('creating') : t('signingIn')}
          </>
        ) : isSignup ? (
          t('createAccount')
        ) : (
          t('signIn')
        )}
      </button>

      {isSignup && (
        <p className="text-muted-foreground mt-4 text-center text-[12.5px] leading-relaxed">
          {t.rich('termsAgree', {
            terms: (chunks) => (
              <Link
                href="/terms"
                className="text-blue font-medium underline-offset-2 hover:underline"
              >
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link
                href="/privacy"
                className="text-blue font-medium underline-offset-2 hover:underline"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
    </form>
  );
}

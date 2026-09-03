'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useRouter } from '@/i18n/navigation';
import { inviteUser, linkUserByEmail, removeMember, updateMemberRole } from '@/lib/firm/members';

import { dangerButton, inputClass, labelClass, primaryButton, secondaryButton, selectClass } from './ui';

export type MemberRow = {
  userId: string;
  name: string;
  email: string;
  role: 'client_owner' | 'client_viewer';
};

type Role = MemberRow['role'];

function initials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

// Who can see a business: link an existing account by email, or invite a new
// person (Supabase invite → /invite). Role changes and removals are inline.
export function MemberManager({
  entityId,
  members,
  canEdit,
}: {
  entityId: string;
  members: MemberRow[];
  canEdit: boolean;
}) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('client_viewer');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(kind: 'link' | 'invite') {
    setNotice(null);
    startTransition(async () => {
      const res =
        kind === 'link'
          ? await linkUserByEmail({ entityId, email, role })
          : await inviteUser({ entityId, email, role, fullName });
      if (!res.ok) return setNotice({ kind: 'error', text: res.error });
      setNotice({ kind: 'ok', text: kind === 'link' ? t('memberLinked') : t('memberInvited') });
      setEmail('');
      setFullName('');
      router.refresh();
    });
  }

  function changeRole(userId: string, next: Role) {
    startTransition(async () => {
      const res = await updateMemberRole({ entityId, userId, role: next });
      if (!res.ok) setNotice({ kind: 'error', text: res.error });
      router.refresh();
    });
  }

  function remove(userId: string) {
    if (confirmRemove !== userId) return setConfirmRemove(userId);
    setConfirmRemove(null);
    startTransition(async () => {
      const res = await removeMember({ entityId, userId });
      if (!res.ok) setNotice({ kind: 'error', text: res.error });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {members.length === 0 ? (
        <p className="text-muted-foreground text-[14px]">{t('noMembers')}</p>
      ) : (
        <ul className="divide-line border-line divide-y overflow-hidden rounded-xl border">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="bg-secondary text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold">
                {initials(m.name || m.email)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-ink block truncate text-[14px] font-semibold">
                  {m.name || m.email}
                </span>
                {m.name && (
                  <span className="text-muted-foreground block truncate text-[12.5px]">{m.email}</span>
                )}
              </span>
              {canEdit ? (
                <>
                  <select
                    aria-label={t('memberRole')}
                    value={m.role}
                    disabled={isPending}
                    onChange={(e) =>
                      changeRole(m.userId, e.target.value === 'client_owner' ? 'client_owner' : 'client_viewer')
                    }
                    className={`${selectClass} h-9 w-auto min-w-[130px] text-[13.5px]`}
                  >
                    <option value="client_owner">{t('roleOwner')}</option>
                    <option value="client_viewer">{t('roleViewer')}</option>
                  </select>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => remove(m.userId)}
                    className={dangerButton}
                  >
                    {confirmRemove === m.userId ? t('confirmRemove') : t('removeMember')}
                  </button>
                </>
              ) : (
                <span className="bg-blue-pale text-blue rounded-full px-2.5 py-1 text-[12.5px] font-semibold">
                  {m.role === 'client_owner' ? t('roleOwner') : t('roleViewer')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <form
          onSubmit={(e) => e.preventDefault()}
          className="border-line bg-paper grid gap-4 rounded-xl border p-4 sm:grid-cols-[1fr_1fr_auto]"
        >
          <div>
            <label htmlFor="memberEmail" className={labelClass}>
              {t('memberEmail')}
            </label>
            <input
              id="memberEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="memberName" className={labelClass}>
              {t('memberName')}
            </label>
            <input
              id="memberName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="memberRoleNew" className={labelClass}>
              {t('memberRole')}
            </label>
            <select
              id="memberRoleNew"
              value={role}
              onChange={(e) => setRole(e.target.value === 'client_owner' ? 'client_owner' : 'client_viewer')}
              className={selectClass}
            >
              <option value="client_viewer">{t('roleViewer')}</option>
              <option value="client_owner">{t('roleOwner')}</option>
            </select>
          </div>
          {notice && (
            <p
              role={notice.kind === 'error' ? 'alert' : 'status'}
              className={`sm:col-span-3 text-[13.5px] ${notice.kind === 'error' ? 'text-danger' : 'text-success'}`}
            >
              {notice.text}
            </p>
          )}
          <div className="flex flex-wrap gap-3 sm:col-span-3">
            <button
              type="button"
              disabled={isPending || email.length === 0}
              onClick={() => submit('link')}
              className={secondaryButton}
            >
              {isPending ? t('linking') : t('linkExisting')}
            </button>
            <button
              type="button"
              disabled={isPending || email.length === 0}
              onClick={() => submit('invite')}
              className={primaryButton}
            >
              {isPending ? t('inviting') : t('sendInvite')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

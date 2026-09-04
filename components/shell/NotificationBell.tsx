'use client';

import { Bell } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Popover } from 'radix-ui';
import { useTransition } from 'react';

import { Link } from '@/i18n/navigation';
import { markNotificationsRead } from '@/lib/portal/notification-actions';
import type { PortalNotification } from '@/lib/portal/notifications';

// The notifications control in the top bar (§7). The badge counts unread rows
// and the panel marks them read when it opens, so the count means "since you
// last looked" rather than "ever". An empty list says so — no placeholder rows.
export function NotificationBell({ notifications }: { notifications: PortalNotification[] }) {
  const t = useTranslations('Notifications');
  const format = useFormatter();
  const [, startTransition] = useTransition();
  const unread = notifications.filter((notification) => notification.readAt === null);

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (!open || unread.length === 0) return;
        startTransition(async () => {
          await markNotificationsRead(unread.map((notification) => notification.id));
        });
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={unread.length > 0 ? t('openWithCount', { count: unread.length }) : t('open')}
          className="text-muted-foreground hover:bg-secondary hover:text-ink focus-visible:ring-blue/40 relative inline-flex size-10 items-center justify-center rounded-xl transition outline-none focus-visible:ring-3"
        >
          <Bell className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
          {unread.length > 0 && (
            <span className="bg-danger ring-card absolute top-1.5 right-1.5 min-w-[16px] rounded-full px-1 text-[10px] leading-4 font-bold text-white ring-2">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="border-line bg-card z-50 w-[min(360px,calc(100vw-2rem))] rounded-2xl border p-2 shadow-[0_12px_32px_rgba(15,23,42,0.16)]"
        >
          <p className="text-ink px-3 py-2 text-[13px] font-semibold">{t('title')}</p>
          {notifications.length === 0 ? (
            <p className="text-muted-foreground px-3 pt-1 pb-3 text-[13px]">{t('empty')}</p>
          ) : (
            <ul className="max-h-[min(60vh,420px)] overflow-y-auto">
              {notifications.map((notification) => {
                const worded = wording(notification, t, format);
                const body = (
                  <>
                    <span className="flex items-start gap-2">
                      {notification.readAt === null && <span className="bg-blue mt-1.5 size-1.5 shrink-0 rounded-full" aria-hidden="true" />}
                      <span className={`text-ink text-[13.5px] font-semibold ${notification.readAt === null ? '' : 'ml-3.5'}`}>{worded.title}</span>
                    </span>
                    {worded.body && <span className="text-muted-foreground mt-0.5 ml-3.5 block text-[12.5px] leading-[1.45]">{worded.body}</span>}
                    {/* An absolute timestamp, not a relative one: "2 hours ago"
                        needs a reference time the server and the browser agree
                        on, and getting that wrong shifts every row on hydration. */}
                    <span className="text-muted-foreground mt-1 ml-3.5 block text-[11.5px]">
                      {format.dateTime(new Date(notification.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </>
                );
                return (
                  <li key={notification.id}>
                    {notification.linkPath ? (
                      <Popover.Close asChild>
                        <Link href={notification.linkPath} className="hover:bg-secondary block rounded-xl px-3 py-2.5 transition">
                          {body}
                        </Link>
                      </Popover.Close>
                    ) : (
                      <div className="px-3 py-2.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

type Translate = ReturnType<typeof useTranslations<'Notifications'>>;
type Format = ReturnType<typeof useFormatter>;

/**
 * A notification row stores facts, not sentences: the job that wrote it may
 * have run while nobody was reading, and the reader's locale is only known
 * here. Titles the firm authored (a document name, a reminder's own wording)
 * are shown as written; everything around them is translated. Rows written
 * before migration 0014 carry no payload and fall back to their stored text.
 */
function wording(notification: PortalNotification, t: Translate, format: Format): { title: string; body: string | null } {
  const payload = notification.payload ?? {};
  const due = typeof payload.dueDate === 'string' ? payload.dueDate : null;
  // Anchored and formatted in UTC: `new Date('2026-09-15T00:00:00')` is parsed
  // in the runtime's own zone, so the server and the browser would print
  // different days for the same due date and the whole shell would fall back to
  // client rendering on the mismatch.
  const dueText = due ? format.dateTime(new Date(`${due}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' }) : null;

  switch (notification.kind) {
    case 'document.published':
      return {
        title: notification.title,
        body: t(payload.replaced === 'true' ? 'body_document_updated' : 'body_document_published'),
      };
    case 'document.unpublished':
      return { title: notification.title, body: t('body_document_unpublished') };
    case 'reminder.due':
      return {
        title: notification.title,
        body: dueText ? t('body_due_on', { date: dueText }) : notification.body,
      };
    case 'tax.deadline': {
      const type = typeof payload.taxType === 'string' ? payload.taxType : notification.title;
      const label = type === 'income' || type === 'sales' || type === 'payroll' ? t(`taxType_${type}`) : type;
      return {
        title: t('title_tax_deadline', { tax: label }),
        body: dueText ? t('body_due_on', { date: dueText }) : notification.body,
      };
    }
    default:
      return { title: notification.title, body: notification.body };
  }
}

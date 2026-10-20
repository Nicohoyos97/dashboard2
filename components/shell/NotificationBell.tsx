'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Popover } from 'radix-ui';
import { useEffect, useTransition } from 'react';

import { Link } from '@/i18n/navigation';
import { markNotificationsRead } from '@/lib/portal/notification-actions';
import type { PortalNotification } from '@/lib/portal/notifications';

import { BellTrigger } from './menu-triggers';

// The notifications control in the top bar (§7). The badge counts unread rows
// and the panel marks them read when it opens, so the count means "since you
// last looked" rather than "ever". An empty list says so — no placeholder rows.
// Loaded on demand through lazy-menus.tsx, which renders the same trigger until then.
export function NotificationBellLoaded({ notifications, defaultOpen = false }: { notifications: PortalNotification[]; defaultOpen?: boolean }) {
  const t = useTranslations('Notifications');
  const format = useFormatter();
  const [, startTransition] = useTransition();
  const unread = notifications.filter((notification) => notification.readAt === null);
  const markRead = () => {
    if (unread.length === 0) return;
    startTransition(async () => {
      await markNotificationsRead(unread.map((notification) => notification.id));
    });
  };
  // Radix calls onOpenChange for an opening, not for a panel born open: a click
  // that arrived before this code did opens it that way, and still counts.
  useEffect(() => {
    if (defaultOpen) markRead();
    // Once, for the panel this mount opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Popover.Root
      defaultOpen={defaultOpen}
      onOpenChange={(open) => {
        if (open) markRead();
      }}
    >
      <Popover.Trigger asChild>
        <BellTrigger unread={unread.length} />
      </Popover.Trigger>
      <Popover.Portal>
        {/* On a phone the panel is a bar that drops out of the header and spans
            it: the bell sits 8px above the header's bottom edge, so the offset
            that floats a card on a desktop lands this flush against it, and
            `collisionPadding={0}` lets a full-width panel clamp to x=0 instead
            of hanging off the side it is aligned to. Above `sm` it is the
            anchored card it has always been. */}
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={0}
          className="border-line bg-card z-50 w-screen rounded-t-none rounded-b-2xl border border-x-0 border-t-0 p-2 shadow-menu outline-none sm:w-[min(360px,calc(100vw-2rem))] sm:rounded-2xl sm:border-x sm:border-t"
        >
          <p className="text-ink px-3 py-2 text-small font-semibold">{t('title')}</p>
          {notifications.length === 0 ? (
            <p className="text-muted-foreground px-3 pt-1 pb-3 text-small">{t('empty')}</p>
          ) : (
            <ul className="max-h-[min(60vh,420px)] overflow-y-auto">
              {notifications.map((notification) => {
                const worded = wording(notification, t, format);
                const body = (
                  <>
                    <span className="flex items-start gap-2">
                      {notification.readAt === null && <span className="bg-blue mt-1.5 size-1.5 shrink-0 rounded-full" aria-hidden="true" />}
                      <span className={`text-ink text-ui font-semibold ${notification.readAt === null ? '' : 'ml-3.5'}`}>{worded.title}</span>
                    </span>
                    {worded.body && <span className="text-muted-foreground mt-0.5 ml-3.5 block text-small leading-[1.45]">{worded.body}</span>}
                    {/* An absolute timestamp, not a relative one: "2 hours ago"
                        needs a reference time the server and the browser agree
                        on, and getting that wrong shifts every row on hydration. */}
                    <span className="text-muted-foreground mt-1 ml-3.5 block text-caption">
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

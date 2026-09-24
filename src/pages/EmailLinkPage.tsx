import { useEffect, useRef, useState } from 'react';
import { confirmSubscription, unsubscribeWithToken } from '../lib/emailApi';
import { emailSignupEnabled } from '../lib/flags';
import { linkHandler } from '../lib/router';
import { TODAY, WORD_BY_SLUG } from '../lib/words';
import { openSubscribe } from '../state/dialogs';
import { PageShell } from './PageShell';

type State = 'working' | 'confirmed' | 'already_confirmed' | 'expired' | 'invalid' | 'unsubscribed' | 'resubscribed' | 'blocked' | 'error';

const tokenFromUrl = () => new URLSearchParams(window.location.search).get('token') ?? '';

/** Landing pages for links in Durar's emails: confirm a subscription, or unsubscribe. No sign-in. */
export default function EmailLinkPage({ kind }: { kind: 'confirm' | 'unsubscribe' }) {
  const [state, setState] = useState<State>('working');
  const [busy, setBusy] = useState(false);
  const token = useRef(tokenFromUrl());
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = kind === 'confirm' ? 'Confirm your subscription · Durar' : 'Unsubscribe · Durar';
    // Personal links stay out of search engines (the prerendered HTML already says so).
    if (document.querySelector('meta[name="robots"]')) return;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [kind]);

  useEffect(() => {
    let live = true;
    if (!token.current) {
      setState('invalid'); // nothing to send without a token
      return;
    }
    // The visit itself is the action (one click from the email). It's a POST from this page, so mail
    // scanners that merely fetch the link change nothing.
    const run = kind === 'confirm' ? confirmSubscription(token.current) : unsubscribeWithToken(token.current);
    run
      .then((s) => live && setState((s === 'unknown' ? 'unsubscribed' : s) as State))
      .catch(() => live && setState('error'));
    return () => {
      live = false;
    };
  }, [kind]);

  useEffect(() => {
    if (state !== 'working') heading.current?.focus();
  }, [state]);

  const resubscribe = async () => {
    setBusy(true);
    try {
      const s = await unsubscribeWithToken(token.current, true);
      setState(s === 'confirmed' ? 'resubscribed' : s === 'blocked' ? 'blocked' : 'invalid');
    } catch {
      setState('error');
    } finally {
      setBusy(false);
    }
  };

  const today = WORD_BY_SLUG.get(TODAY.slug)!;
  const toToday = (
    <a className="btn btn-primary" href={`/word/${today.slug}`} onClick={linkHandler(`/word/${today.slug}`)}>
      Meet today’s pearl,{' '}
      <span lang="ar" dir="rtl">
        {today.ar}
      </span>
    </a>
  );
  const subscribeAgain = emailSignupEnabled && (
    <button type="button" className="btn btn-quiet" onClick={openSubscribe}>
      Subscribe again
    </button>
  );

  const copy: Record<State, { title: string; body: React.ReactNode; actions?: React.ReactNode }> = {
    working: { title: kind === 'confirm' ? 'Confirming…' : 'Unsubscribing…', body: null },
    confirmed: {
      title: 'You’re in',
      body: 'Tomorrow at about 7:00 (Amsterdam time), the first pearl will be waiting in your inbox.',
      actions: toToday,
    },
    already_confirmed: { title: 'Already confirmed', body: 'You’re subscribed. The pearls will keep arriving each morning.', actions: toToday },
    expired: { title: 'This link has expired', body: 'Confirmation links work for 7 days. Ask for a new one and it will reach you right away.', actions: subscribeAgain || toToday },
    invalid: { title: 'This link doesn’t work', body: 'It may be incomplete, or already used up. Copy the whole link from the email, or ask for a new one.', actions: subscribeAgain || toToday },
    unsubscribed: {
      title: 'You’re unsubscribed',
      body: 'No more Pearl of the Day emails will come to this address. The sea is still here whenever you want it.',
      actions: (
        <>
          <button type="button" className="btn btn-quiet" onClick={resubscribe} disabled={busy} aria-busy={busy}>
            {busy ? 'One moment…' : 'I changed my mind, resubscribe'}
          </button>
          {toToday}
        </>
      ),
    },
    resubscribed: { title: 'Welcome back', body: 'The next pearl arrives at about 7:00 tomorrow.', actions: toToday },
    blocked: { title: 'We can’t email this address', body: 'Earlier emails to it bounced or were reported, so we won’t send more.', actions: toToday },
    error: { title: 'Something went wrong', body: 'We couldn’t reach the server. Check your connection and reload this page.', actions: toToday },
  };
  const c = copy[state];

  return (
    <PageShell>
      <section className="email-link" aria-busy={state === 'working'} data-testid="email-link-page" data-state={state}>
        <p className="email-link-ar" lang="ar" dir="rtl">
          دُرَّةُ اليَوْم
        </p>
        <h1 ref={heading} tabIndex={-1} className="page-title email-link-title">
          {c.title}
        </h1>
        {c.body && <p className="email-link-body">{c.body}</p>}
        {c.actions && <div className="email-link-actions">{c.actions}</div>}
      </section>
    </PageShell>
  );
}

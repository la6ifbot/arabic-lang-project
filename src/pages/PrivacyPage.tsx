import { accountsMode } from '../account/backend';
import { useAccount } from '../account/store';
import { linkHandler } from '../lib/router';
import { PageShell } from './PageShell';

const REGION = import.meta.env.VITE_DATA_REGION;
const CONTACT = import.meta.env.VITE_CONTACT_EMAIL;

/** Plain-language privacy notice. Kept short on purpose: Durar stores very little. */
export default function PrivacyPage() {
  const signedIn = useAccount((s) => s.status === 'signed-in');

  return (
    <PageShell>
      <h1 className="page-title">Privacy</h1>
      <div className="prose">
        <p className="prose-lead">
          You can use Durar without an account. Browsing, searching and swiping don’t send anything about you to us. An
          account is only needed to keep pearls and carry your progress between devices, and then we store as little as
          we can.
        </p>

        <h2>What we store when you create an account</h2>
        <ul>
          <li>
            <strong>Your email address</strong>, so you can sign in and reset your password.
          </li>
          <li>
            <strong>Your password</strong>, as a one-way hash we can’t read. If you use Google, we store no password; Google
            tells us your email address and that you signed in.
          </li>
          <li>
            <strong>The words you save</strong> and when you saved each one.
          </li>
          <li>
            <strong>Your progress</strong>: for each word you’ve swiped, which of the five boxes it’s in, when it’s due back,
            when you last reviewed it, how many times you’ve seen it and how many times it slipped back to “still learning”.
          </li>
        </ul>
        <p>We don’t load your Google profile photo.</p>

        <h2>Your progress</h2>
        <p>
          Progress is what lets a word you know sink deeper and come back later, and a word you’re learning come back
          tomorrow. It’s used only for that: the order of the sea, how deep each pearl sits, the Library, and one line in
          the daily email (below). Nothing else, and never for ads or tracking.
        </p>
        <p>
          <strong>Without an account, your progress stays in this browser only</strong> and is never sent to us. If you
          then sign in, it’s added to your account and removed from the browser.
        </p>
        <p>
          To start over, choose <strong>Reset my progress…</strong> in the account menu or at the bottom of My Pearls. It
          clears your progress everywhere (your account and this browser). Your saved pearls stay.
        </p>

        <h2>Why</h2>
        <p>Only to let you sign in and see your pearls on any device. We don’t sell or share this data or use it for ads.</p>

        <h2>Where it’s kept</h2>
        <p>
          Accounts and saved words are stored by <strong>Supabase</strong>, our database and sign-in provider
          {REGION ? (
            <>
              , on servers in <strong>{REGION}</strong>
            </>
          ) : null}
          . The website itself is served by <strong>Vercel</strong>, which keeps standard, short-lived server logs. Fonts are
          served from our own site, not from Google. Pictures (the word cards in link previews and in the daily email, and the
          illustrations) come from <strong>img.durar.space</strong>, our image host on{' '}
          <strong>Amazon CloudFront</strong> in our own Amazon Web Services account, with its access logs switched off.
        </p>
        <p>
          Who made the pictures and fonts we use, and their licences, is on the{' '}
          <a href="/credits" onClick={linkHandler('/credits')}>
            Credits
          </a>{' '}
          page.
        </p>

        <h2>If you get the Pearl of the Day by email</h2>
        <p>You don’t need an account for this. When you subscribe we store:</p>
        <ul>
          <li>
            <strong>Your email address</strong> and whether you’ve confirmed it, with the dates you subscribed, confirmed or
            unsubscribed.
          </li>
          <li>
            <strong>Which day’s email was sent to you</strong>, so nobody gets the same day twice. We keep this for 60 days.
          </li>
          <li>
            To stop abuse of the sign-up form, <strong>a scrambled (hashed) form of your IP address</strong>, kept for one day.
          </li>
        </ul>
        <p>
          If your subscription is linked to a Durar account, the email may add one line, “A pearl to revisit”, with a word
          from your progress that’s due again. Subscribers without an account get the same email as everyone.
        </p>
        <p>
          Addresses that don’t confirm within 7 days are deleted. The email is sent by <strong>Amazon SES</strong> from its
          Frankfurt (EU) region. We don’t track opens or clicks: no tracking pixels, no redirected links. Every email has a
          one-click unsubscribe link, and signed-in readers can also switch the email off in the account menu. If an address
          bounces or its owner reports the email as spam, we stop sending to it.
        </p>

        <h2>Cookies and browser storage</h2>
        <p>
          Durar sets no cookies and uses no analytics or tracking of any kind. When you sign in, your browser’s local storage
          keeps your session so you stay signed in. If you tap Save while signed out, it briefly remembers that word so we can
          save it once you’ve signed in. Without an account, it keeps your progress. It also remembers how deep the sea was
          on your last visit, so it doesn’t change suddenly, and whether you’ve seen “How it works”, so it only opens by itself
          once. All of this is strictly necessary for features you use, so
          there’s no cookie banner.
        </p>

        <h2>Deleting your data</h2>
        <p>
          Open the account menu (the pearl in the top-left corner) and choose <strong>Delete my account</strong>. Your
          account, every saved word, your progress and any email subscription for your address are removed at once,
          permanently. Signing
          out removes the session from this browser. To stop the daily email without an account, use the unsubscribe link in
          any of them.
        </p>
        {accountsMode !== 'off' && signedIn && (
          <p>
            <button type="button" className="link-btn" onClick={() => useAccount.setState({ confirmDelete: true })}>
              Delete my account now
            </button>
          </p>
        )}

        {CONTACT && (
          <>
            <h2>Questions</h2>
            <p>
              Write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a> about anything on this page, including a copy of your data.
            </p>
          </>
        )}
      </div>
    </PageShell>
  );
}

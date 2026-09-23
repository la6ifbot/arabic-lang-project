import { accountsMode } from '../account/backend';
import { useAccount } from '../account/store';
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
          account is only needed to keep pearls, and then we store as little as we can.
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
            <strong>The words you save</strong> and when you saved each one. That’s the whole of “My Pearls”.
          </li>
        </ul>
        <p>
          We don’t store your swipes: whether you marked a word “known” or “still learning” stays in your browser and is
          forgotten when you close the tab. We don’t load your Google profile photo.
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
          served from our own site, not from Google.
        </p>

        <h2>Cookies and browser storage</h2>
        <p>
          Durar sets no cookies and uses no analytics or tracking of any kind. When you sign in, your browser’s local storage
          keeps your session so you stay signed in. If you tap Save while signed out, it briefly remembers that word so we can
          save it once you’ve signed in. Both are strictly necessary for features you ask for, so there’s no cookie banner.
        </p>

        <h2>Deleting your data</h2>
        <p>
          Open the account menu (the pearl in the top-left corner) and choose <strong>Delete my account</strong>. Your
          account and every saved word are removed at once, permanently. Signing out removes the session from this browser.
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

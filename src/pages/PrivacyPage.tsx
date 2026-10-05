import { accountsMode } from '../account/backend';
import { downloadMyData, useAccount, useDataExport } from '../account/store';
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
            <strong>Your email address</strong>, so you can sign in and reset your password, and to send you the Pearl of
            the Day email (below) unless you switch it off.
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
        <p>
          Only to let you sign in, see your pearls on any device and get the daily email. We don’t sell or share this data
          or use it for ads.
        </p>

        <h2 id="services">Services that handle data</h2>
        <p>
          Durar uses a few services to run. Each one sees only what it needs for its job:
        </p>
        <ul data-testid="privacy-services">
          <li>
            <strong>Vercel</strong> (our host) serves the website and runs our small server functions, in Frankfurt
            (Germany, EU): subscribing, confirming, unsubscribing, the daily email and the health check. Like any web
            server it sees your IP address and browser with each request, in short-lived logs.
          </li>
          <li>
            <strong>Supabase</strong> (our database and sign-in) keeps accounts, saved words, progress and the email
            list{REGION ? <>, on servers in <strong>{REGION}</strong></> : null}.
          </li>
          <li>
            <strong>Amazon Web Services</strong>, in our own account: <strong>Amazon SES</strong> sends our emails from its
            Frankfurt region, so it handles your address and each email it delivers. <strong>Amazon S3</strong> and{' '}
            <strong>CloudFront</strong> store and serve the pictures from <strong>img.durar.space</strong>, with access
            logs switched off. Our encrypted backups are kept in a separate, private S3 store in Frankfurt.
          </li>
          <li>
            <strong>Cloudflare Turnstile</strong> checks that the subscribe, sign-up and password-reset forms are used by a
            person and not a bot. It looks at your browser and IP address when you use those forms.
          </li>
          <li>
            <strong>Namecheap</strong> registers our domain and forwards email sent to our address to our mailbox, which{' '}
            <strong>Google</strong> (Gmail) hosts. If you write to us, those two handle your message.
          </li>
          <li>
            <strong>Google</strong> handles your sign-in only if you choose “Continue with Google”: it tells us your email
            address and that you signed in.
          </li>
          <li>
            <strong>GitHub</strong> holds the site’s code and runs our nightly backup: it copies the database, encrypts the
            copy, and stores it in our private storage in Frankfurt. Only the encrypted copy is kept, for up to a year.
          </li>
          <li>
            <strong>UptimeRobot</strong> visits a few of our public pages every few minutes and tells us if the site is down.
            It never sees anything about you.
          </li>
        </ul>
        <p>
          We don’t sell or share data with anyone else. Fonts are served from our own site, not from Google.
        </p>
        {/* The Deep (leaderboard): its section goes here (Phase 0.7, section F). */}

        <h2 id="retention">How long we keep things</h2>
        <ul>
          <li>Your account, saved words and progress: until you delete them or your account.</li>
          <li>Email sign-ups that are never confirmed: 7 days.</li>
          <li>Which day’s email was sent to whom: 60 days.</li>
          <li>The scrambled (hashed) IP address used to stop abuse of the subscribe form: 1 day.</li>
          <li>
            Our error log, which notes which part of the site failed and how, never who it was for: 30 days.
          </li>
          <li>Encrypted backups: the last 30 nightly copies and 12 monthly copies, then they’re deleted.</li>
        </ul>
        <p>Deleting your account removes your data at once; it disappears from the backups as the older copies expire.</p>

        <p>
          Who made the pictures and fonts we use, and their licences, is on the{' '}
          <a href="/credits" onClick={linkHandler('/credits')}>
            Credits
          </a>{' '}
          page.
        </p>

        <h2>If you get the Pearl of the Day by email</h2>
        <p>
          Every account gets it once its address is confirmed, by the link we email you or by Google. Switch it off any
          time in the account menu or with the link at the bottom of each email. You can also subscribe without an
          account. For the email we store:
        </p>
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

        <h2 id="your-data">A copy of your data</h2>
        <p>
          Signed in, choose <strong>Download my data</strong> in the account menu or below. You get a JSON file with your
          account’s email address and creation date, your saved pearls, your progress, and your email subscription. Only you
          can download your own.
        </p>
        {accountsMode !== 'off' && signedIn && <DownloadMyData />}

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

function DownloadMyData() {
  const { state, message } = useDataExport();
  return (
    <>
      <p>
        <button type="button" className="link-btn" onClick={() => void downloadMyData()} disabled={state === 'working'} data-testid="privacy-download">
          Download my data
        </button>
      </p>
      {state !== 'idle' && (
        <p data-testid="privacy-download-status">
          {message}
        </p>
      )}
    </>
  );
}

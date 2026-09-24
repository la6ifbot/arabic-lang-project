/**
 * Owner commands for the daily email.
 *
 *   npm run email:render                 write today's emails to dist-email/ to open in a browser
 *   npm run email:render -- --slug=bahr  …for a specific word
 *   npm run email:dry-run                count who would get today's email (needs Supabase env)
 *   npm run email:test                   send today's email to EMAIL_SANDBOX_TO now (needs SES env)
 *
 * Reads .env.local if present. Against the live site you can also call the deployed job:
 *   curl -H "Authorization: Bearer $CRON_SECRET" "https://<site>/api/cron/daily?test=1"
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../server/config.js';
import { productionDeps } from '../server/deps.js';
import { buildMime } from '../server/email/mime.js';
import { renderConfirmation, renderDaily } from '../server/email/templates.js';
import { handleDaily } from '../server/handlers.js';
import { WORDS } from '../server/words.js';
import { amsterdamDate, pearlForDate } from '../shared/pearlOfTheDay.js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const [command = 'render', ...args] = process.argv.slice(2);
const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

async function main() {
  const config = loadConfig();
  if (command === 'render') {
    const date = arg('date') ?? amsterdamDate();
    const slug = arg('slug') ?? pearlForDate(date, WORDS);
    const word = WORDS.find((w) => w.slug === slug);
    if (!word) throw new Error(`Unknown word: ${slug}`);
    const unsubscribeUrl = `${config.siteUrl}/unsubscribe?token=preview`;
    const daily = renderDaily({ word, date, siteUrl: config.siteUrl, unsubscribeUrl, contactEmail: config.contactEmail, subjectStyle: config.subjectStyle });
    const confirm = renderConfirmation({ confirmUrl: `${config.siteUrl}/subscribe/confirm?token=preview`, siteUrl: config.siteUrl, unsubscribeUrl, contactEmail: config.contactEmail });
    mkdirSync('dist-email', { recursive: true });
    writeFileSync('dist-email/daily.html', daily.html);
    writeFileSync('dist-email/daily.txt', daily.text);
    writeFileSync('dist-email/daily.eml', buildMime({ to: 'you@example.com', from: config.from, ...daily }));
    writeFileSync('dist-email/confirmation.html', confirm.html);
    writeFileSync('dist-email/confirmation.txt', confirm.text);
    console.log(`Rendered ${slug} for ${date} → dist-email/ (subject: ${daily.subject})`);
    return;
  }
  if (command === 'dry-run' || command === 'test') {
    const deps = productionDeps({ ...process.env, CRON_SECRET: 'local' });
    const res = await handleDaily(new Request(`${config.siteUrl}/api/cron/daily?${command === 'test' ? 'test' : 'dry'}=1`, { headers: { authorization: 'Bearer local' } }), deps);
    console.log(JSON.stringify(await res.json(), null, 2));
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

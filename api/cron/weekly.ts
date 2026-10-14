import { route } from '../../server/deps.js';
import { handleWeekly } from '../../server/handlers.js';

// Called by Supabase pg_cron on Mondays at 06:00 and 07:00 UTC (see supabase/setup/weekly-digest-cron.sql).
// Only the call that falls in 08:xx Amsterdam sends the owner's weekly digest.
export const GET = route(handleWeekly, 'weekly');

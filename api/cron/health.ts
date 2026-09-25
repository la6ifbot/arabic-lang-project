import { route } from '../../server/deps.js';
import { handleHealth } from '../../server/handlers.js';

// Called by Supabase pg_cron at :15 past 06 and 07 UTC (see supabase/setup/health-check-cron.sql).
// Only the call that falls in 08:xx Amsterdam checks today's run, and emails the owner if needed.
export const GET = route(handleHealth);

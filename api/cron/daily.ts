import { route } from '../../server/deps.js';
import { handleDaily } from '../../server/handlers.js';

// Called every 10 minutes between 05:00 and 06:59 UTC by Supabase pg_cron (see
// supabase/setup/daily-email-cron.sql). Only the calls that fall in 07:xx Amsterdam send.
export const GET = route(handleDaily);

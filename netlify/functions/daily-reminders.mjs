// Runs by itself every day at 9:30 AM India time (04:00 UTC).
import { runReminders, runWinback, runReviewAsks } from '../lib/reminders.mjs';

export default async () => {
  await runReminders();
  try { await runWinback(); } catch (e) { console.error('winback job failed', String(e)); }
  try { await runReviewAsks(); } catch (e) { console.error('review job failed', String(e)); }
};
export const config = { schedule: '0 4 * * *' };

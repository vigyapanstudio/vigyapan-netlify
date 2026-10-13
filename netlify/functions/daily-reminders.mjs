// Runs by itself every day at 9:30 AM India time (04:00 UTC).
import { runReminders, runWinback, runReviewAsks } from '../lib/reminders.mjs';
import { runWeekly, runProgress, runLeadFollowups, runCartReminders } from '../lib/jobs.mjs';

const safe = async (name, fn) => { try { await fn(); } catch (e) { console.error(name + ' job failed', String(e)); } };

export default async () => {
  await safe('reminders', runReminders);
  await safe('cart reminders', runCartReminders);
  await safe('weekly plan', runWeekly);
  await safe('progress', runProgress);
  await safe('lead follow-up', runLeadFollowups);
  await safe('winback', runWinback);
  await safe('review asks', runReviewAsks);
};
export const config = { schedule: '0 4 * * *' };

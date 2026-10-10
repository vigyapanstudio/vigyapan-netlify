// Runs by itself every day at 9:30 AM India time (04:00 UTC).
import { runReminders } from '../lib/reminders.mjs';

export default async () => { await runReminders(); };
export const config = { schedule: '0 4 * * *' };

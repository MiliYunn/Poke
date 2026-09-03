import { json } from '@sveltejs/kit';
import { unseal } from '$lib/server/auth/session';
import { setReportPlan, type ReportPlan } from '$lib/server/reports/quota';

type Session = { wallet: string; expiresAt: number };

export const POST = async ({ request, cookies }) => {
  const session = await unseal<Session>(cookies.get('poke_session'));
  if (!session || session.expiresAt < Date.now()) return json({ error: 'Sign in with your wallet before changing plans.' }, { status: 401 });

  const plan = String((await request.json()).plan || '') as ReportPlan;
  if (!['free', 'premium'].includes(plan)) return json({ error: 'Choose a valid plan.' }, { status: 400 });

  const quota = await setReportPlan(session.wallet, plan);
  return json({ plan: quota.plan, quota });
};

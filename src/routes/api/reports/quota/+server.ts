import { json } from '@sveltejs/kit';
import { unseal } from '$lib/server/auth/session';
import { consumeReportAttempt, getReportQuota } from '$lib/server/reports/quota';

type Session = { wallet: string; expiresAt: number };

async function authenticatedWallet(cookies: { get: (name: string) => string | undefined }) {
  const session = await unseal<Session>(cookies.get('poke_session'));
  return session && session.expiresAt >= Date.now() ? session.wallet : null;
}

export const GET = async ({ cookies }) => {
  const wallet = await authenticatedWallet(cookies);
  if (!wallet) return json({ error: 'Wallet sign-in is required.' }, { status: 401 });
  return json(await getReportQuota(wallet));
};

export const POST = async ({ cookies }) => {
  const wallet = await authenticatedWallet(cookies);
  if (!wallet) return json({ error: 'Wallet sign-in is required.' }, { status: 401 });

  const quota = await consumeReportAttempt(wallet);
  if (!quota.consumed) {
    return json(
      { ...quota, error: `Your ${quota.plan} plan's ${quota.limit} whistleblower report attempts have been used. Upgrade your plan to submit another report.` },
      { status: 429 }
    );
  }
  return json(quota);
};

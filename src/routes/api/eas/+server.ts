import { json } from '@sveltejs/kit';

const endpoint = 'https://sepolia.easscan.org/graphql';
const fields = 'id attester recipient refUID revocable revocationTime expirationTime data';

async function queryEas(query: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query }),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.errors) throw new Error(body.errors?.[0]?.message || `EAS returned ${response.status}`);
    return body.data;
  } finally {
    clearTimeout(timer);
  }
}

export const GET = async () => {
  try {
    const data = await queryEas(`query LatestAttestations { attestations(take: 6, orderBy: { time: desc }) { ${fields} } }`);
    return json({ network: 'Ethereum Sepolia', attestations: data.attestations || [], source: endpoint });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'EAS is unavailable.' }, { status: 502 });
  }
};

export const POST = async ({ request }) => {
  try {
    const uid = String((await request.json()).uid || '').trim().toLowerCase();
    if (!/^0x[a-f0-9]{64}$/.test(uid)) return json({ error: 'Enter a complete 0x attestation UID.' }, { status: 400 });
    const data = await queryEas(`query Attestation { attestation(where: { id: "${uid}" }) { ${fields} } }`);
    if (!data.attestation) return json({ error: 'No Sepolia attestation was found for that UID.' }, { status: 404 });
    return json({ network: 'Ethereum Sepolia', attestation: data.attestation, source: endpoint });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'EAS lookup failed.' }, { status: 502 });
  }
};

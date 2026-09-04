<script lang="ts">
  import { onMount } from 'svelte';
  import { env } from '$env/dynamic/public';
  import { decodeFunctionResult, encodeFunctionData, parseAbi } from 'viem';
  import AppHeader from '$components/AppHeader.svelte';
  import { attestationNetworks, pokeAttestationRegistryAbi } from '$lib/contracts/pokeAttestationRegistry';

  type Interface = { name: string; description: string; url: string; kind: 'eas' | 'external' };
  type Attestation = { id: string; attester: string; recipient: string; refUID: string; revocable: boolean; revocationTime: number; expirationTime: number; data: string };
  type PokeAttestation = { reportHash: string; submitter: string; timestamp: number; schema: string; contract: string; chainId: number; network: string; transactionHash?: string };
  type EthereumProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

  const interfaces: Interface[] = [
    { name: 'EAS Explorer', description: 'Inspect public Ethereum attestations.', url: 'https://sepolia.easscan.org/', kind: 'eas' },
    { name: 'Safe Apps', description: 'Open the Safe application directory.', url: 'https://app.safe.global/apps', kind: 'external' }
  ];

  let selected = interfaces[0];
  let uid = '';
  let loading = true;
  let error = '';
  let latest: Attestation[] = [];
  let result: Attestation | null = null;
  let pokeResult: PokeAttestation | null = null;

  const registryAbi = parseAbi([...pokeAttestationRegistryAbi]);

  const short = (value: string) => value ? `${value.slice(0, 8)}…${value.slice(-6)}` : 'None';
  const detailUrl = (id: string) => `https://sepolia.easscan.org/attestation/view/${id}`;

  async function loadLatest() {
    loading = true;
    error = '';
    try {
      const response = await fetch('/api/eas');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      latest = body.attestations;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Could not load EAS attestations.';
    } finally {
      loading = false;
    }
  }

  async function lookup() {
    if (!uid.trim() || loading) return;
    loading = true;
    error = '';
    result = null;
    pokeResult = null;
    try {
      const localAttestation = await lookupPokeCommitment(uid.trim().toLowerCase());
      if (localAttestation) {
        pokeResult = localAttestation;
        return;
      }
      const response = await fetch('/api/eas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uid }) });
      const body = await response.json();
      if (!response.ok) throw new Error(`${body.error} If this came from Poké Whistleblow, anchor it first and use the same testnet recorded in its disclosure package.`);
      result = body.attestation;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'EAS lookup failed.';
    } finally {
      loading = false;
    }
  }

  async function lookupPokeCommitment(reportHash: string) {
    if (!/^0x[a-f0-9]{64}$/.test(reportHash)) return null;
    const ethereum = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
    if (!ethereum) return null;
    const chainId = Number.parseInt(String(await ethereum.request({ method: 'eth_chainId' })), 16);
    const reports = JSON.parse(localStorage.getItem('poke-reports') || '[]') as Array<{ hash?: string; attestation?: { chainId: number; network: string; contract: string; transactionHash: string } }>;
    const saved = reports.find((report) => report.hash?.toLowerCase() === reportHash);
    if (saved?.attestation?.chainId && saved.attestation.chainId !== chainId) {
      throw new Error(`This is a Poké report commitment. Switch MetaMask to ${saved.attestation.network || attestationNetworks[saved.attestation.chainId] || `chain ${saved.attestation.chainId}`} and inspect it again.`);
    }
    const configured = env.PUBLIC_ATTESTATION_CONTRACT || '';
    const stored = localStorage.getItem(`poke-attestation-contract:${chainId}`) || '';
    const contract = saved?.attestation?.contract || (/^0x[a-fA-F0-9]{40}$/.test(configured) ? configured : stored);
    if (!/^0x[a-fA-F0-9]{40}$/.test(contract)) return null;
    try {
      const data = encodeFunctionData({ abi: registryAbi, functionName: 'attestations', args: [reportHash as `0x${string}`] });
      const raw = String(await ethereum.request({ method: 'eth_call', params: [{ to: contract, data }, 'latest'] })) as `0x${string}`;
      const [submitter, timestamp, schema] = decodeFunctionResult({ abi: registryAbi, functionName: 'attestations', data: raw });
      if (timestamp === 0n) return null;
      return { reportHash, submitter, timestamp: Number(timestamp), schema, contract, chainId, network: attestationNetworks[chainId] || `Chain ${chainId}`, transactionHash: saved?.attestation?.transactionHash } satisfies PokeAttestation;
    } catch {
      return null;
    }
  }

  onMount(loadLatest);
</script>

<svelte:head><title>Dapp Interfaces — Poké</title></svelte:head>
<AppHeader active="dapps"/>

<main class="route-page">
  <section class="route-title">
    <div><span class="eyebrow">PLUGGABLE DAPP SHELL</span><h1>Protocol interfaces</h1><p>Third-party views are registered as replaceable adapters. Poké never injects wallet credentials into embedded pages.</p></div>
  </section>
  <section class="network-section">
    <div class="network-cards dapp-cards">
      {#each interfaces as item}
        <button class:active={selected.name === item.name} onclick={() => selected = item}><div><strong>{item.name}</strong><small>{item.description}</small></div><b>Open →</b></button>
      {/each}
    </div>
  </section>
  <section class="explorer-workbench">
    <div class="workbench-head"><div><span class="eyebrow">THIRD-PARTY ORIGIN</span><h2>{selected.name}</h2></div><a href={selected.url} target="_blank" rel="noopener noreferrer">Open safely in new tab ↗</a></div>
    {#if selected.kind === 'eas'}
      <div class="eas-console">
        <section class="eas-intro">
          <div><span class="eas-network"><i></i> Ethereum Sepolia</span><h3>Attestation intelligence,<br/><em>inside Poké.</em></h3><p>Inspect official EAS UIDs or Poké whistleblower commitments. Poké commitments are verified against their deployed testnet registry; official UIDs use the EAS Sepolia indexer.</p></div>
          <div class="eas-actions">
            <a href="https://sepolia.easscan.org/attestation/create" target="_blank" rel="noopener noreferrer"><span>＋</span><strong>Make attestation</strong><small>Open official EAS flow ↗</small></a>
            <a href="https://sepolia.easscan.org/schemas/explore" target="_blank" rel="noopener noreferrer"><span>⌘</span><strong>Browse schemas</strong><small>Explore Sepolia schemas ↗</small></a>
            <a href="https://sepolia.easscan.org/tools" target="_blank" rel="noopener noreferrer"><span>◇</span><strong>Verification tools</strong><small>Use official EAS tools ↗</small></a>
          </div>
        </section>

        <form class="eas-search" onsubmit={(event) => { event.preventDefault(); lookup(); }}>
          <label for="eas-uid">EAS UID OR POKÉ REPORT COMMITMENT</label>
          <div><span>⌕</span><input id="eas-uid" bind:value={uid} placeholder="Paste the complete 0x… UID or report hash"/><button disabled={loading || !uid.trim()}>{loading ? 'Loading…' : 'Inspect'}</button></div>
          {#if error}<p>{error}</p>{/if}
        </form>

        {#if pokeResult}
          <section class="eas-result">
            <div class="eas-section-title"><div><span class="status ok">VERIFIED POKÉ REGISTRY RECORD</span><h3>Whistleblower commitment</h3></div>{#if pokeResult.transactionHash}<code>{short(pokeResult.transactionHash)}</code>{/if}</div>
            <div class="eas-detail-grid">
              <div><small>REPORT COMMITMENT</small><code>{pokeResult.reportHash}</code></div>
              <div><small>STATUS</small><strong>Anchored</strong></div>
              <div><small>SUBMITTER</small><code>{pokeResult.submitter}</code></div>
              <div><small>BLOCKCHAIN TIMESTAMP</small><strong>{new Date(pokeResult.timestamp * 1000).toLocaleString()}</strong></div>
              <div><small>NETWORK</small><strong>{pokeResult.network} · {pokeResult.chainId}</strong></div>
              <div><small>REGISTRY CONTRACT</small><code>{pokeResult.contract}</code></div>
            </div>
          </section>
        {/if}

        {#if result}
          <section class="eas-result">
            <div class="eas-section-title"><div><span class="status ok">VERIFIED INDEXER RECORD</span><h3>Attestation details</h3></div><a href={detailUrl(result.id)} target="_blank" rel="noopener noreferrer">View on EAS ↗</a></div>
            <div class="eas-detail-grid">
              <div><small>UID</small><code>{result.id}</code></div>
              <div><small>STATUS</small><strong>{Number(result.revocationTime) > 0 ? 'Revoked' : 'Active'}</strong></div>
              <div><small>ATTESTER</small><code>{result.attester}</code></div>
              <div><small>RECIPIENT</small><code>{result.recipient || 'No recipient'}</code></div>
              <div><small>REFERENCE UID</small><code>{result.refUID || 'None'}</code></div>
              <div><small>REVOCABLE</small><strong>{result.revocable ? 'Yes' : 'No'}</strong></div>
            </div>
          </section>
        {/if}

        <section class="eas-latest">
          <div class="eas-section-title"><div><span class="eyebrow">LIVE SEPOLIA INDEX</span><h3>Recent attestations</h3></div><button onclick={loadLatest} disabled={loading}>↻ Refresh</button></div>
          {#if loading && !latest.length}
            <div class="eas-empty">Loading official EAS records…</div>
          {:else if latest.length}
            <div class="eas-table-head"><span>UID</span><span>ATTESTER</span><span>RECIPIENT</span><span>STATUS</span></div>
            {#each latest as attestation}
              <a class="eas-row" href={detailUrl(attestation.id)} target="_blank" rel="noopener noreferrer"><code>{short(attestation.id)}</code><code>{short(attestation.attester)}</code><code>{short(attestation.recipient)}</code><strong>{Number(attestation.revocationTime) > 0 ? 'Revoked' : 'Active'}</strong></a>
            {/each}
          {:else}
            <div class="eas-empty">Recent records are temporarily unavailable. UID lookup and the official EAS links remain available.</div>
          {/if}
        </section>
      </div>
    {:else}
      <div class="external-dapp-panel">
        <div class="external-dapp-icon" aria-hidden="true">↗</div>
        <span class="eyebrow">SECURE EXTERNAL APP</span>
        <h3>{selected.name} opens in its own tab</h3>
        <p>{selected.name} blocks iframe embedding as a security measure. Use its official site directly to prevent a frozen or refused-to-connect screen.</p>
        <a class="external-dapp-button" href={selected.url} target="_blank" rel="noopener noreferrer">Launch {selected.name} safely ↗</a>
        <small>You will leave Poké and continue at app.safe.global.</small>
      </div>
    {/if}
  </section>
</main>

<script lang="ts">
  import { onMount } from 'svelte';
  import AppHeader from '$components/AppHeader.svelte';

  type Interface = { name: string; description: string; url: string; kind: 'eas' | 'external' };
  type Attestation = { id: string; attester: string; recipient: string; refUID: string; revocable: boolean; revocationTime: number; expirationTime: number; data: string };

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
    try {
      const response = await fetch('/api/eas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uid }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      result = body.attestation;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'EAS lookup failed.';
    } finally {
      loading = false;
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
          <div><span class="eas-network"><i></i> Ethereum Sepolia</span><h3>Attestation intelligence,<br/><em>inside Poké.</em></h3><p>Look up public EAS records without leaving the command center. Results come from the official EAS Sepolia indexer.</p></div>
          <div class="eas-actions">
            <a href="https://sepolia.easscan.org/attestation/create" target="_blank" rel="noopener noreferrer"><span>＋</span><strong>Make attestation</strong><small>Open official EAS flow ↗</small></a>
            <a href="https://sepolia.easscan.org/schemas/explore" target="_blank" rel="noopener noreferrer"><span>⌘</span><strong>Browse schemas</strong><small>Explore Sepolia schemas ↗</small></a>
            <a href="https://sepolia.easscan.org/tools" target="_blank" rel="noopener noreferrer"><span>◇</span><strong>Verification tools</strong><small>Use official EAS tools ↗</small></a>
          </div>
        </section>

        <form class="eas-search" onsubmit={(event) => { event.preventDefault(); lookup(); }}>
          <label for="eas-uid">ATTESTATION UID</label>
          <div><span>⌕</span><input id="eas-uid" bind:value={uid} placeholder="0x… 64-character attestation UID"/><button disabled={loading || !uid.trim()}>{loading ? 'Loading…' : 'Inspect'}</button></div>
          {#if error}<p>{error}</p>{/if}
        </form>

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

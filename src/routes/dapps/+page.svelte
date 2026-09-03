<script lang="ts">
  import AppHeader from '$components/AppHeader.svelte';

  type Interface = { name: string; description: string; url: string; embeddable: boolean };

  const interfaces: Interface[] = [
    { name: 'EAS Explorer', description: 'Inspect public Ethereum attestations.', url: 'https://sepolia.easscan.org/', embeddable: true },
    { name: 'Safe Apps', description: 'Open the Safe application directory.', url: 'https://app.safe.global/apps', embeddable: false }
  ];

  let selected = interfaces[0];
</script>

<svelte:head><title>Dapp Interfaces — Poké</title></svelte:head>
<AppHeader active="dapps"/>

<main class="route-page">
  <section class="route-title">
    <div><span class="eyebrow">PLUGGABLE DAPP SHELL</span><h1>Protocol interfaces</h1><p>Third-party views are registered as replaceable adapters. Poké never injects wallet credentials into embedded pages.</p></div>
  </section>
  <section class="network-section">
    <div class="network-cards">
      {#each interfaces as item}
        <button class:active={selected.name === item.name} onclick={() => selected = item}><div><strong>{item.name}</strong><small>{item.description}</small></div><b>Open →</b></button>
      {/each}
    </div>
  </section>
  <section class="explorer-workbench">
    <div class="workbench-head"><div><span class="eyebrow">THIRD-PARTY ORIGIN</span><h2>{selected.name}</h2></div><a href={selected.url} target="_blank" rel="noopener noreferrer">Open safely in new tab ↗</a></div>
    {#if selected.embeddable}
      <iframe title={selected.name} src={selected.url} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerpolicy="no-referrer" style="width:100%;height:650px;border:0"></iframe>
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

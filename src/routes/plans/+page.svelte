<script lang="ts">
  import AppHeader from '$components/AppHeader.svelte'; import { onMount } from 'svelte';
  let plan:'free'|'premium'='free'; let usage=0; let scamUsage=0; let changed=false;
  onMount(()=>{plan=localStorage.getItem('poke-plan')==='premium'?'premium':'free';usage=Number(localStorage.getItem('poke-report-usage')||0);scamUsage=Number(localStorage.getItem('poke-scam-usage')||0);});
  function choose(next:'free'|'premium'){plan=next;localStorage.setItem('poke-plan',next);changed=true;setTimeout(()=>changed=false,1800);}
</script>
<svelte:head><title>Plans — Poké</title><meta name="description" content="Choose a Poké report-verification plan."/></svelte:head>
<AppHeader active="plans" />
<main class="route-page plans-page">
  <section class="plans-hero"><span class="eyebrow">SIMPLE, EVIDENCE-FIRST PRICING</span><h1>Start free.<br/><em>Protect more with Premium.</em></h1><p>Portfolio and Explorer remain open to everyone. Plans include monthly AI-assisted scam scans and a total allowance of tamper-evident whistleblower report attempts.</p><div class="current-plan"><span>Current plan</span><strong>{plan==='premium'?'Premium':'Free'}</strong><small>{scamUsage} scans this month · {usage} report attempts used</small></div></section>
  {#if changed}<div class="plan-toast">Plan updated for this MVP device.</div>{/if}
  <section class="pricing-grid">
    <article class:current={plan==='free'}><div class="plan-top"><span class="eyebrow">FREE</span>{#if plan==='free'}<b>Current</b>{/if}</div><h2>For occasional verification</h2><div class="price"><strong>RM0</strong><span>/ month</span></div><p>Explore Web3, check suspicious targets, and preserve important reports.</p><ul><li><i>✓</i><span><strong>5 AI scam scans</strong> per month</span></li><li><i>✓</i><span><strong>5 whistleblower report attempts</strong> total</span></li><li><i>✓</i><span><strong>5 evidence files</strong> per report</span></li><li><i>✓</i><span>Cross-chain portfolio access</span></li><li><i>✓</i><span>Multi-chain block explorer</span></li></ul><button onclick={()=>choose('free')} disabled={plan==='free'}>{plan==='free'?'Current plan':'Switch to Free'}</button></article>
    <article class="premium" class:current={plan==='premium'}><div class="recommended">RECOMMENDED</div><div class="plan-top"><span class="eyebrow">PREMIUM</span>{#if plan==='premium'}<b>Current</b>{/if}</div><h2>For active investigators</h2><div class="price"><strong>RM29</strong><span>/ month</span></div><p>Run more analyses and preserve more evidence with expanded AI context.</p><ul><li><i>✓</i><span><strong>100 AI scam scans</strong> per month</span></li><li><i>✓</i><span><strong>100 whistleblower report attempts</strong> total</span></li><li><i>✓</i><span><strong>20 evidence files</strong> per report</span></li><li><i>✓</i><span>Expanded Gonka chatbot usage</span></li><li><i>✓</i><span>Exportable verification records</span></li></ul><button onclick={()=>choose('premium')} disabled={plan==='premium'}>{plan==='premium'?'Current plan':'Try Premium in MVP'}</button></article>
  </section>
  <section class="billing-note"><div>ⓘ</div><div><strong>MVP billing note</strong><p>The plan selector demonstrates access control locally and does not charge money. Production billing requires authentication, a payment provider, and server-enforced wallet quotas.</p></div></section>
</main>

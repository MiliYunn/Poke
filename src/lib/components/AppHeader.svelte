<script lang="ts">import WalletAuth from './WalletAuth.svelte'; let { active = 'overview' }: { active?: 'overview'|'portfolio'|'explorer'|'dapps'|'plans'|'profile' } = $props();</script>
<header class="app-header">
  <a class="brand" href="/" aria-label="Poké home"><span class="mark">P</span><strong>poké</strong><span class="beta">MVP</span></a>
  <nav aria-label="Primary">
    <a class:active={active==='overview'} href="/">Overview</a>
    <a class:active={active==='portfolio'} href="/portfolio">Portfolio</a>
    <a class:active={active==='explorer'} href="/explorer">Explorer</a>
    <a class:active={active==='dapps'} href="/dapps">Dapps</a>
    <a class:active={active==='plans'} href="/plans">Plans</a>
  </nav>
  <div class="header-status"><span></span>3 testnets online</div><div class="top-actions"><a class="risk" href="/?panel=scam">Scam detection</a><a class="whistle" href="/?panel=whistle">Whistleblow</a></div><WalletAuth />
</header>

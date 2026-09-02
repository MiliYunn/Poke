<script lang="ts">import WalletAuth from './WalletAuth.svelte'; let { active = 'overview' }: { active?: 'overview'|'verify'|'portfolio'|'explorer'|'plans'|'profile' } = $props();</script>
<header class="app-header">
  <a class="brand" href="/" aria-label="Poké home"><span class="mark">P</span><strong>poké</strong><span class="beta">MVP</span></a>
  <nav aria-label="Primary">
    <a class:active={active==='overview'} href="/">Overview</a>
    <a class:active={active==='verify'} href="/verify">Verify</a>
    <a class:active={active==='portfolio'} href="/portfolio">Portfolio</a>
    <a class:active={active==='explorer'} href="/explorer">Explorer</a>
    <a class:active={active==='plans'} href="/plans">Plans</a>
  </nav>
  <div class="header-status"><span></span>3 testnets online</div><WalletAuth />
</header>

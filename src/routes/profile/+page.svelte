<script lang="ts">
  import AppHeader from '$components/AppHeader.svelte'; import { onMount } from 'svelte';
  type User={wallet:string;expiresAt:number}; let user:User|null=null;let loading=true;let displayName='Poké user';let plan='free';let usage=0;let scamUsage=0;let saved=false;
  onMount(async()=>{const data=await fetch('/api/auth/session').then(r=>r.json()).catch(()=>({user:null}));user=data.user;displayName=localStorage.getItem('poke-display-name')||'Poké user';plan=localStorage.getItem('poke-plan')||'free';usage=Number(localStorage.getItem('poke-report-usage')||0);scamUsage=Number(localStorage.getItem('poke-scam-usage')||0);loading=false;});
  function save(){localStorage.setItem('poke-display-name',displayName.trim()||'Poké user');saved=true;setTimeout(()=>saved=false,1500);}
  async function logout(){await fetch('/api/auth/session',{method:'DELETE'});location.href='/';}
  async function copy(){if(user)await navigator.clipboard.writeText(user.wallet);}
</script>
<svelte:head><title>Profile — Poké</title><meta name="description" content="Manage your Poké wallet account and usage."/></svelte:head>
<AppHeader active="profile" />
<main class="route-page profile-page">
  {#if loading}<div class="profile-loading">Loading secure session…</div>{:else if !user}<section class="profile-locked"><div>⌁</div><h1>Sign in to view your profile</h1><p>Use the Sign in button above and approve a one-time wallet message.</p><a href="/">Return to overview</a></section>{:else}
  <section class="profile-hero"><div class="profile-avatar">{displayName.slice(0,2).toUpperCase()}</div><div><span class="eyebrow">WALLET ACCOUNT</span><h1>{displayName}</h1><button onclick={copy}>{user.wallet.slice(0,10)}…{user.wallet.slice(-8)} · Copy</button></div><span class="session-safe">✓ Verified session</span></section>
  <section class="profile-layout"><div class="profile-card"><div class="section-head"><div><span class="eyebrow">PUBLIC PROFILE</span><h2>Account details</h2></div></div><div class="profile-form"><label for="name">Display name</label><input id="name" bind:value={displayName} maxlength="50"/><div class="field-label">Connected wallet</div><code>{user.wallet}</code><div class="field-label">Session expires</div><span>{new Date(user.expiresAt).toLocaleString()}</span><button onclick={save}>{saved?'Saved':'Save profile'}</button></div></div><aside class="account-sidebar"><div class="usage-card"><span class="eyebrow">CURRENT PLAN</span><h2>{plan==='premium'?'Premium':'Free'}</h2><p>{scamUsage} of {plan==='premium'?100:5} scam scans used</p><div class="usage-track"><i style={`width:${Math.min(100,scamUsage/(plan==='premium'?100:5)*100)}%`}></i></div><p>{usage} of {plan==='premium'?100:5} whistleblower reports used</p><div class="usage-track"><i style={`width:${Math.min(100,usage/(plan==='premium'?100:5)*100)}%`}></i></div><a href="/plans">Manage plan →</a></div><div class="security-card"><span class="eyebrow">SECURITY</span><h2>Wallet-authenticated</h2><p>Poké stores the session in an HttpOnly cookie. Browser scripts cannot read it.</p><button onclick={logout}>Log out securely</button></div></aside></section>
  {/if}
</main>

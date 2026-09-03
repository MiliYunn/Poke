<script lang="ts">
  import { chains } from '$lib/config/chains'; import { onMount } from 'svelte'; import WalletAuth from '$components/WalletAuth.svelte'; import WhistleblowModal from '$components/WhistleblowModal.svelte';
  let query = '';
  let activeChain: (typeof chains)[number] = chains[0];
  let tab: 'portfolio'|'activity'|'nfts' = 'portfolio';
  let chatOpen = false;
  let reportOpen = false;
  let scamOpen = false;
  let chatInput = '';
  let messages: {role:'user'|'assistant';content:string;model?:string;requestId?:string}[] = [{role:'assistant',content:'Ask me about the wallet, chain, transaction, or risk evidence currently on screen.'}];
  let report = '';
  let reportHash = '';
  let inspectedAddress = '';
  let balances: Array<{chainId:number;name:string;symbol:string;amount:string;status:string;error?:string}> = [];
  let loading = false;
  let notice = 'Enter a 0x address, transaction hash, or block number.';
  let explorerResult: Record<string, unknown> | null = null;
  let riskEvidence: Array<{label:string;status:string;detail:string;source?:string}> = [];
  let walletAddress = '';
  let chatLoading = false;
  let plan: 'free'|'premium' = 'free'; let reportUsage = 0; let proofSaved = false;
  let scamUsage=0;let scamTarget='';let scamDescription='';let scamLoading=false;let scamError='';let scamResult:{truthScore:number;riskLevel:string;confidence:string;scamType:string;summary:string;reasoningTrace:string[];evidence:string[];avoidance:string[];protection:string[];missingInformation:string[];disclaimer:string}|null=null;
  let scamProofs:Array<{requestId:string;model:string;analysis:{riskLevel:string;truthScore:number}}>=[];let scamConsensus='';
  let evidenceFiles: Array<{id:string;name:string;size:number;type:string;hash:string}> = []; let fileError=''; let hashingFiles=false;
  $: reportLimit = plan === 'premium' ? 100 : 5;
  $: scamLimit = plan === 'premium' ? 100 : 5;
  $: fileLimit = plan === 'premium' ? 20 : 5;
  onMount(()=>{plan=(localStorage.getItem('poke-plan')==='premium'?'premium':'free');reportUsage=Number(localStorage.getItem('poke-report-usage')||0);scamUsage=Number(localStorage.getItem('poke-scam-usage')||0);const params=new URLSearchParams(location.search);const panel=params.get('panel');scamOpen=panel==='scam';reportOpen=panel==='whistle';scamTarget=params.get('target')||'';if(scamTarget){const cached=(JSON.parse(localStorage.getItem('poke-scam-scans')||'[]') as Array<any>).find(item=>item.target?.toLowerCase()===scamTarget.toLowerCase());if(cached){scamResult=cached.result;scamProofs=cached.inferences||[];scamConsensus=cached.consensus||'cached';}}});

  async function inspect() {
    if (!query.trim()) return;
    loading=true; notice='Querying live testnet data…'; explorerResult=null;
    try {
      if (/^0x[a-fA-F0-9]{40}$/.test(query.trim())) {
        const response=await fetch(`/api/portfolio?address=${encodeURIComponent(query.trim())}`); const data=await response.json();
        if(!response.ok) throw new Error(data.error); inspectedAddress=data.address; balances=data.balances; notice=`Updated ${new Date(data.fetchedAt).toLocaleTimeString()}`;
        const risk=await fetch(`/api/scam-score?chainId=${activeChain.id}&target=${encodeURIComponent(query.trim())}`).then(r=>r.json()); riskEvidence=risk.evidence;
      } else {
        const response=await fetch(`/api/explorer?chainId=${activeChain.id}&query=${encodeURIComponent(query.trim())}`); const data=await response.json();
        if(!response.ok) throw new Error(data.error); explorerResult=data.result; tab='activity'; notice=`Live ${data.type} loaded from ${activeChain.name}`;
      }
    } catch(error) { notice=error instanceof Error?error.message:'Request failed'; }
    finally { loading=false; }
  }
  async function connectWallet() { try { const ethereum=(window as unknown as {ethereum?:{request:(args:{method:string})=>Promise<string[]>}}).ethereum; if(!ethereum) throw new Error('Install an EVM wallet such as MetaMask.'); const accounts=await ethereum.request({method:'eth_requestAccounts'}); walletAddress=accounts[0]||''; query=walletAddress; if(walletAddress) await inspect(); } catch(error){notice=error instanceof Error?error.message:'Wallet connection failed';} }
  function hex(buffer:ArrayBuffer){return '0x'+[...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');}
  async function addEvidence(event:Event){const input=event.currentTarget as HTMLInputElement;const selected=Array.from(input.files||[]);fileError='';if(evidenceFiles.length+selected.length>fileLimit){fileError=`Your ${plan} plan allows ${fileLimit} files per report.`;input.value='';return;}const allowed=['image/png','image/jpeg','image/webp','application/pdf','text/plain','application/json'];if(selected.some(file=>!allowed.includes(file.type))){fileError='Use PNG, JPG, WEBP, PDF, TXT, or JSON files only.';input.value='';return;}if(selected.some(file=>file.size>10*1024*1024)){fileError='Each evidence file must be 10 MB or smaller.';input.value='';return;}hashingFiles=true;for(const file of selected){const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());evidenceFiles=[...evidenceFiles,{id:crypto.randomUUID(),name:file.name,size:file.size,type:file.type,hash:hex(digest)}];}hashingFiles=false;input.value='';reportHash='';proofSaved=false;}
  function removeEvidence(id:string){evidenceFiles=evidenceFiles.filter(file=>file.id!==id);reportHash='';proofSaved=false;}
  async function hashReport() { const commitment=JSON.stringify({version:1,report:report.trim(),evidence:evidenceFiles.map(file=>({name:file.name,size:file.size,type:file.type,sha256:file.hash}))}); const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(commitment)); reportHash=hex(digest);proofSaved=false; }
  function saveProof(){if(!reportHash||reportUsage>=reportLimit)return;reportUsage+=1;localStorage.setItem('poke-report-usage',String(reportUsage));const saved=JSON.parse(localStorage.getItem('poke-reports')||'[]') as Array<Record<string,unknown>>;const record={hash:reportHash,report:report.trim(),evidence:evidenceFiles.map(file=>({name:file.name,size:file.size,type:file.type,sha256:file.hash})),createdAt:new Date().toISOString()};localStorage.setItem('poke-reports',JSON.stringify([record,...saved.filter(item=>item.hash!==reportHash)].slice(0,100)));proofSaved=true;}
  async function sendChat() { if(!chatInput.trim()||chatLoading) return; const text=chatInput.trim(); const conversation=[...messages,{role:'user' as const,content:text}]; messages=conversation; chatInput='';chatLoading=true;try { const hash=text.match(/0x[a-fA-F0-9]{64}/)?.[0]?.toLowerCase();const saved=JSON.parse(localStorage.getItem('poke-reports')||'[]') as Array<{hash:string;report?:string;evidence?:unknown[];createdAt:string}>;const record=hash?saved.find(item=>item.hash.toLowerCase()===hash):null;const context=`Current Poké screen context:\nSelected chain: ${activeChain.name} (${activeChain.id}).\nWallet: ${inspectedAddress||walletAddress||'none selected'}.\nLatest explorer result: ${explorerResult?JSON.stringify(explorerResult).slice(0,2500):'none'}.\nCurrent scam evidence: ${riskEvidence.length?JSON.stringify(riskEvidence):'none'}.\nSaved report matching the question: ${record?JSON.stringify(record):'none'}.\nCite these facts as Current screen context. If a report hash has no matching saved report, explain that its report content or evidence is required; never infer risk from a hash.`;const requestMessages=[{role:'user',content:context},...conversation.slice(-8).map(m=>({role:m.role,content:m.content}))];const r=await fetch('/api/ai/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:requestMessages})}); const data=await r.json(); messages=[...messages,{role:'assistant',content:data.choices?.[0]?.message?.content || data.error || 'No response returned.',model:data.model,requestId:data.id}]; } catch { messages=[...messages,{role:'assistant',content:'The Poké assistant is temporarily unavailable. Please try again.'}]; } finally {chatLoading=false;} }
  async function runScamScan(){if(scamUsage>=scamLimit||(!scamTarget.trim()&&!scamDescription.trim())||scamLoading)return;scamLoading=true;scamError='';scamResult=null;scamProofs=[];scamConsensus='';const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),70_000);try{const response=await fetch('/api/ai/scam-synthesis',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({target:scamTarget,description:scamDescription,chainId:activeChain.id}),signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error);scamResult=data.analysis;scamProofs=data.inferences||[];scamConsensus=data.consensus||'single-model';riskEvidence=data.heuristics||[];scamUsage+=1;localStorage.setItem('poke-scam-usage',String(scamUsage));localStorage.setItem('poke-scam-scans',JSON.stringify([{target:scamTarget,result:data.analysis,inferences:data.inferences,consensus:data.consensus,scannedAt:data.scannedAt},...JSON.parse(localStorage.getItem('poke-scam-scans')||'[]')].slice(0,50)));}catch(error){scamError=error instanceof Error&&error.name==='AbortError'?'The scan took too long and was stopped. No scan was deducted. Please try again.':error instanceof Error?error.message:'Scam scan failed.';}finally{clearTimeout(timer);scamLoading=false;}}
</script>

<div class="shell">
  <header>
    <a class="brand" href="/" aria-label="Poké home"><span class="mark">P</span><strong>poké</strong><span class="beta">MVP</span></a>
    <nav aria-label="Primary"><a class="active" href="/">Overview</a><a href="/portfolio">Portfolio</a><a href="/explorer">Explorer</a><a href="/dapps">Dapps</a><a href="/plans">Plans</a></nav>
    <div class="top-actions"><button class="risk" onclick={()=>scamOpen=true}><i></i> Scam detection</button><button class="whistle" onclick={()=>reportOpen=true}>Whistleblow</button><WalletAuth /></div>
  </header>

  <main>
    <section class="command" id="explorer">
      <div><span class="eyebrow">UNIVERSAL WEB3 SEARCH</span><h1>One address.<br/><em>Every chain.</em></h1><p>Inspect balances, NFTs, transactions, and evidence without jumping between explorers.</p></div>
      <form onsubmit={(e)=>{e.preventDefault();inspect()}}><label for="query">Address, transaction, or block</label><div class="search"><span>⌕</span><input id="query" bind:value={query} placeholder="0x address, transaction hash, or block"/><button disabled={loading}>{loading?'Loading…':'Inspect'} <kbd>↵</kbd></button></div><small class:error={notice.toLowerCase().includes('error')}>{notice}</small></form>
    </section>

    <section class="chainbar" aria-label="Networks">
      {#each chains as chain}<button class:active={activeChain.id===chain.id} onclick={()=>activeChain=chain}><span style={`background:${chain.color}`}></span>{chain.name}<small>{chain.id}</small></button>{/each}
    </section>

    <section class="workspace">
      <div class="panel portfolio" id="portfolio">
        <div class="panel-head"><div><span class="eyebrow">PORTFOLIO</span><h2>Cross-chain position</h2></div><span class="live"><i></i> {loading?'Loading':'Live RPC'}</span></div>
        <div class="identity"><div class="avatar">0x</div><div><strong>{inspectedAddress || 'No address selected'}</strong><span>{inspectedAddress ? 'Resolved EVM address':'Enter an address above'}</span></div><button aria-label="Copy address" onclick={()=>inspectedAddress&&navigator.clipboard.writeText(inspectedAddress)}>□</button></div>
        <div class="tabs">{#each ['portfolio','activity','nfts'] as item}<button class:active={tab===item} onclick={()=>tab=item as typeof tab}>{item}</button>{/each}</div>
        {#if tab==='activity' && explorerResult}<div class="balance"><span>Explorer result</span><strong>{String(explorerResult.number || explorerResult.hash || 'Found').slice(0,22)}</strong><small>{String(explorerResult.hash || explorerResult.from || '')}</small></div><div class="result"><pre>{JSON.stringify(explorerResult,null,2)}</pre></div>{:else}<div class="balance"><span>Networks queried</span><strong>{balances.filter(b=>b.status==='ok').length || '—'} / 3</strong><small>Native testnet balances from public RPC providers</small></div><div class="assets"><div class="asset-head"><span>Asset</span><span>Balance</span><span>Status</span></div>{#each chains as chain}{@const balance=balances.find(b=>b.chainId===chain.id)}<div class="asset"><span class="coin" style={`--coin:${chain.color}`}>{chain.symbol[0]}</span><div><strong>{chain.symbol}</strong><small>{chain.name}</small></div><span>{balance?.amount ?? '—'}</span><span>{balance?.status ?? 'waiting'}</span></div>{/each}</div>{/if}
      </div>

      <aside>
        <div class="panel risk-card"><div class="panel-head"><div><span class="eyebrow">SCAM DETECTION</span><h2>Evidence first</h2></div><span class="unknown">{scamUsage}/{scamLimit} USED</span></div><div class="gauge"><div>{scamResult?.riskLevel?.[0]?.toUpperCase()||'?'}</div><p>{scamResult?`${scamResult.scamType} risk`:'Submit a suspicious target'}<span>{scamResult?.summary||'Scan a wallet, contract, URL, domain, message, or investment offer.'}</span></p></div>{#each (riskEvidence.length?riskEvidence:[{label:'Target classification',status:'unknown',detail:'Awaiting input'},{label:'User evidence',status:'unknown',detail:'Add suspicious behavior'},{label:'Gonka synthesis',status:'unknown',detail:'Runs after submission'}]) as row}<div class="check"><span>{row.status==='pass'?'✓':'○'}</span><strong>{row.label}</strong><small>{row.detail}</small></div>{/each}<button class="full scam-submit" onclick={()=>scamOpen=true}>Start scam scan</button></div>
        <div class="panel attest"><span class="eyebrow">TAMPER-EVIDENT REPORTS</span><h2>Anchor the proof,<br/>protect the person.</h2><p>Report content is hashed in your browser. Only the proof is anchored on-chain.</p><button onclick={()=>reportOpen=true}>Create a report <span>→</span></button></div>
      </aside>
    </section>
  </main>

  {#if scamOpen}<div class="modal scam-modal" role="presentation" onclick={(e)=>{if(e.target===e.currentTarget&&!scamLoading)scamOpen=false}}><div class="scam-dialog" role="dialog" aria-modal="true" aria-labelledby="scam-title"><button class="close" onclick={()=>scamOpen=false} disabled={scamLoading}>×</button><span class="eyebrow">GONKA-ASSISTED SCAM DETECTION</span><h2 id="scam-title">Scan a suspicious target</h2><div class="quota-line"><span>{plan==='premium'?'Premium':'Free'} plan</span><strong>{scamUsage} / {scamLimit} scans used</strong><a href="/plans">Manage plan</a></div><p>Submit the strongest information you have. Poké combines deterministic checks with GonkaRouter analysis and always shows limitations.</p><form onsubmit={(e)=>{e.preventDefault();runScamScan()}}><label for="scam-target">Wallet, contract, domain, URL, post, claim, or project name</label><input id="scam-target" bind:value={scamTarget} placeholder="0x…, URL, project name, or pasted claim" maxlength="500"/><label for="scam-description">What happened or looked suspicious?</label><textarea id="scam-description" bind:value={scamDescription} placeholder="Example: The site promised guaranteed returns and asked me to approve unlimited token spending…" maxlength="3000"></textarea>{#if scamUsage>=scamLimit}<p class="limit-warning">Your monthly scam-scan limit has been reached. Upgrade to Premium for more scans.</p>{/if}{#if scamError}<p class="limit-warning">{scamError}</p>{/if}<button class="scam-run" disabled={scamLoading||scamUsage>=scamLimit||(!scamTarget.trim()&&!scamDescription.trim())}>{scamLoading?'Running deterministic and Gonka checks…':'Submit and scan · uses 1 scan'}</button></form>{#if scamResult}<section class="scan-output" aria-live="polite"><div class="scan-verdict"><div class={`risk-orb ${scamResult.riskLevel}`}>{scamResult.riskLevel.slice(0,1).toUpperCase()}</div><div><small>RISK LEVEL</small><h3>{scamResult.riskLevel}</h3><span>{scamResult.confidence} confidence</span></div><div class="scam-type"><small>TRUTH SCORE</small><strong>{scamResult.truthScore}%</strong><small>LIKELY TYPE</small><strong>{scamResult.scamType}</strong></div></div><p class="scan-summary">{scamResult.summary}</p><div class="scan-evidence"><h4>Reasoning trace</h4><ol>{#each scamResult.reasoningTrace as item}<li>{item}</li>{/each}</ol></div><div class="scan-evidence"><h4>Evidence and indicators</h4>{#if scamResult.evidence.length}<ul>{#each scamResult.evidence as item}<li><span>!</span>{item}</li>{/each}</ul>{:else}<p>No confirmed evidence was available.</p>{/if}</div><div class="scan-guidance"><div class="avoidance"><h4>1. How to avoid this scam</h4><p>Use these checks before connecting, signing, or sending funds.</p><ul>{#each scamResult.avoidance as item}<li><span>○</span>{item}</li>{/each}</ul></div><div class="protection"><h4>2. How to protect yourself now</h4><p>Use these actions if you already clicked, connected, or approved something.</p><ul>{#each scamResult.protection as item}<li><span>✓</span>{item}</li>{/each}</ul></div></div>
<div class="gonka-proof"><small>GONKA INFERENCE TRANSPARENCY · {scamConsensus}</small>{#each scamProofs as proof}<strong>{proof.model} · {proof.analysis.riskLevel} · {proof.analysis.truthScore}%</strong><code>{proof.requestId}</code>{/each}</div>
<details><summary>Missing information and limitations</summary><ul>{#each scamResult.missingInformation as item}<li>{item}</li>{/each}</ul><p>{scamResult.disclaimer}</p></details></section>{/if}</div></div>{/if}
  <WhistleblowModal bind:open={reportOpen}/>
</div>

<script lang="ts">
  import { onMount } from 'svelte';
  import { env } from '$env/dynamic/public';
  import { encodeFunctionData, parseAbi } from 'viem';
  import { extractPdfText } from '$lib/client/pdf';

  export let open = false;

  type User = { wallet: string; expiresAt: number };
  type Evidence = { id: string; name: string; size: number; type: string; hash: string; data: string; text?: string; extraction: 'text' | 'no-text' | 'binary' | 'failed' };
  type Quota = { plan: 'free' | 'premium'; used: number; limit: number; remaining: number; blocked: boolean };
  type RiskAnalysis = { truthScore: number; riskLevel: string; confidence: string; scamType: string; summary: string; evidence: string[]; missingInformation: string[] };

  let user: User | null = null;
  let report = '';
  let reportHash = '';
  let evidenceFiles: Evidence[] = [];
  let quota: Quota | null = null;
  let busy = false;
  let error = '';
  let saved = false;
  let txHash = '';
  let disclosure = '';
  let expectedHash = '';
  let verifyResult = '';
  let disclosureStatus = '';
  let verifierOpen = false;
  let recoveryKey = '';
  let attemptConsumed = false;
  let wasOpen = false;
  let riskAnalysis: RiskAnalysis | null = null;
  let processingEvidence = false;

  const abi = parseAbi(['function attest(bytes32 reportHash, bytes32 schema)', 'function verify(bytes32 reportHash) view returns (bool)']);
  const zeroHash = `0x${'0'.repeat(64)}` as `0x${string}`;
  const hex = (buffer: ArrayBuffer) => '0x' + [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const b64 = (bytes: Uint8Array) => {
    let value = '';
    for (let i = 0; i < bytes.length; i += 32768) value += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(value);
  };

  function syncQuota(next: Quota) {
    quota = next;
    localStorage.setItem('poke-report-usage', String(next.used));
  }

  async function refresh() {
    const data = await fetch('/api/auth/session').then((response) => response.json()).catch(() => ({ user: null }));
    user = data.user;
  }

  async function loadQuota() {
    const response = await fetch('/api/reports/quota');
    if (response.ok) syncQuota(await response.json());
    else if (response.status === 401) quota = null;
  }

  async function refreshAndLoadQuota() {
    await refresh();
    if (user) await loadQuota();
  }

  function resetForm() {
    report = '';
    reportHash = '';
    evidenceFiles = [];
    saved = false;
    txHash = '';
    recoveryKey = '';
    attemptConsumed = false;
    riskAnalysis = null;
    error = '';
    disclosureStatus = '';
  }

  function closeModal() {
    if (attemptConsumed) resetForm();
    open = false;
  }

  onMount(refreshAndLoadQuota);

  $: if (open && !wasOpen) {
    wasOpen = true;
    void refreshAndLoadQuota();
  } else if (!open && wasOpen) {
    if (attemptConsumed) resetForm();
    wasOpen = false;
  }

  const commitment = () => JSON.stringify({
    version: 1,
    report: report.trim(),
    evidence: evidenceFiles.map(({ name, size, type, hash }) => ({ name, size, type, sha256: hash }))
  });

  async function addEvidence(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    error = '';
    if (quota?.blocked) {
      error = `Your ${quota.plan} plan has no whistleblower report attempts remaining. Upgrade your plan to continue.`;
      input.value = '';
      return;
    }
    processingEvidence = true;
    for (const file of Array.from(input.files || []).slice(0, 5 - evidenceFiles.length)) {
      if (file.size > 10 * 1024 * 1024) {
        error = 'Each file must be 10 MB or smaller.';
        continue;
      }
      const buffer = await file.arrayBuffer();
      const canReadText = file.type === 'text/plain' || file.type === 'application/json' || /\.(txt|json)$/i.test(file.name);
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      let extractedText = canReadText ? new TextDecoder().decode(buffer).slice(0, 12_000) : '';
      let extraction: Evidence['extraction'] = canReadText ? (extractedText.trim() ? 'text' : 'no-text') : 'binary';
      if (isPdf) {
        try {
          extractedText = await extractPdfText(buffer);
          extraction = extractedText ? 'text' : 'no-text';
        } catch {
          extraction = 'failed';
        }
      }
      evidenceFiles = [...evidenceFiles, {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        hash: hex(await crypto.subtle.digest('SHA-256', buffer)),
        data: b64(new Uint8Array(buffer)),
        text: extractedText || undefined,
        extraction
      }];
    }
    processingEvidence = false;
    input.value = '';
    reportHash = '';
    riskAnalysis = null;
    saved = false;
  }

  function riskDescription() {
    const attachmentEvidence = evidenceFiles.map((file) => {
      const metadata = `${file.name} (${file.type}, ${file.size} bytes, SHA-256 ${file.hash})`;
      return file.text ? `${metadata}\nExtracted attachment text:\n${file.text}` : `${metadata}\nBinary attachment: contents were not text-extracted; use as integrity metadata only.`;
    });
    return [`Whistleblower report:\n${report.trim() || '[No typed report content]'}`, attachmentEvidence.length ? `Evidence attachments:\n${attachmentEvidence.join('\n\n')}` : 'Evidence attachments: none'].join('\n\n').slice(0, 12_000);
  }

  function extractionLabel(file: Evidence) {
    if (file.extraction === 'text') return 'Text extracted locally and included in risk analysis';
    if (file.extraction === 'no-text') return 'No embedded text found; this may be a scanned PDF';
    if (file.extraction === 'failed') return 'PDF text extraction failed; integrity hash is still included';
    return 'Integrity hash included; binary content not extracted';
  }

  async function generate() {
    await refresh();
    if (!user) {
      error = 'Sign in with your wallet before creating a whistleblower proof.';
      return;
    }

    busy = true;
    error = '';
    try {
      const quotaResponse = await fetch('/api/reports/quota', { method: 'POST' });
      const nextQuota = await quotaResponse.json();
      if ('used' in nextQuota) syncQuota(nextQuota);
      if (!quotaResponse.ok) throw new Error(nextQuota.error || 'No report attempts remain.');

      reportHash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(commitment())));
      attemptConsumed = true;
      saved = false;
      riskAnalysis = null;

      const riskResponse = await fetch('/api/ai/scam-synthesis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: reportHash, description: riskDescription(), chainId: 11155111 })
      });
      const riskBody = await riskResponse.json();
      if (riskResponse.ok) riskAnalysis = riskBody.analysis;
      else error = `The commitment was generated, but risk analysis is unavailable: ${riskBody.error || 'Please try again later.'}`;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Could not generate the report commitment.';
    } finally {
      busy = false;
    }
  }

  async function encryptedRecord() {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify({ report: report.trim(), evidence: evidenceFiles, riskAssessment: riskAnalysis }));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return {
      ciphertext: b64(new Uint8Array(ciphertext)),
      iv: b64(iv),
      key: b64(new Uint8Array(await crypto.subtle.exportKey('raw', key)))
    };
  }

  async function save() {
    await refresh();
    if (!user || !reportHash) return;
    busy = true;
    error = '';
    try {
      const encrypted = await encryptedRecord();
      recoveryKey = encrypted.key;
      sessionStorage.setItem(`poke-report-key:${reportHash}`, recoveryKey);
      const records = JSON.parse(localStorage.getItem('poke-reports') || '[]') as Array<Record<string, unknown>>;
      const record = {
        hash: reportHash,
        owner: user.wallet,
        encrypted: { ciphertext: encrypted.ciphertext, iv: encrypted.iv },
        createdAt: new Date().toISOString(),
        quota
      };
      localStorage.setItem('poke-reports', JSON.stringify([record, ...records.filter((item) => item.hash !== reportHash)].slice(0, 30)));
      saved = true;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Could not encrypt and save the report.';
    } finally {
      busy = false;
    }
  }

  async function anchor() {
    await refresh();
    if (!user || !reportHash) {
      error = 'Sign in and generate the proof first.';
      return;
    }
    const contract = env.PUBLIC_ATTESTATION_CONTRACT;
    if (!/^0x[a-fA-F0-9]{40}$/.test(contract || '')) {
      error = 'Set PUBLIC_ATTESTATION_CONTRACT after deploying the registry contract.';
      return;
    }
    const ethereum = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!ethereum) {
      error = 'MetaMask is required to anchor the proof.';
      return;
    }
    busy = true;
    error = '';
    try {
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      if (accounts[0]?.toLowerCase() !== user.wallet.toLowerCase()) throw new Error('Use the same wallet that signed in to Poké.');
      const data = encodeFunctionData({ abi, functionName: 'attest', args: [reportHash as `0x${string}`, zeroHash] });
      txHash = String(await ethereum.request({ method: 'eth_sendTransaction', params: [{ from: accounts[0], to: contract, data }] }));
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Attestation transaction failed.';
    } finally {
      busy = false;
    }
  }

  async function copyDisclosure() {
    const packageText = commitment();
    disclosure = packageText;
    expectedHash = reportHash;
    verifyResult = '';
    verifierOpen = true;

    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(packageText);
      disclosureStatus = 'Disclosure JSON copied. It is also shown in the verification section below.';
    } catch {
      disclosureStatus = 'Browser clipboard access was unavailable. The JSON is shown below so you can copy it manually.';
    }
  }

  function downloadDisclosure() {
    const packageText = commitment();
    disclosure = packageText;
    expectedHash = reportHash;
    verifierOpen = true;
    const url = URL.createObjectURL(new Blob([packageText], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `poke-disclosure-${reportHash.slice(2, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    disclosureStatus = 'Disclosure JSON downloaded and loaded into the verification section.';
  }

  async function verifyDisclosure() {
    verifyResult = '';
    error = '';
    try {
      const parsed = JSON.parse(disclosure);
      const canonical = JSON.stringify(parsed);
      const actual = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
      if (actual.toLowerCase() !== expectedHash.trim().toLowerCase()) {
        verifyResult = `Mismatch — recomputed ${actual}`;
        return;
      }
      let chain = 'Hash matches the disclosed package.';
      if (/^0x[a-fA-F0-9]{40}$/.test(env.PUBLIC_ATTESTATION_CONTRACT || '')) {
        const ethereum = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
        if (ethereum) {
          const data = encodeFunctionData({ abi, functionName: 'verify', args: [actual as `0x${string}`] });
          const result = String(await ethereum.request({ method: 'eth_call', params: [{ to: env.PUBLIC_ATTESTATION_CONTRACT, data }, 'latest'] }));
          chain += result.endsWith('1') ? ' On-chain attestation found.' : ' No on-chain attestation found on the connected network.';
        }
      }
      verifyResult = chain;
    } catch {
      error = 'Paste a valid disclosure JSON package and its expected 0x hash.';
    }
  }
</script>

{#if open}
  <div class="modal" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
    <div class="report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <button class="close" onclick={closeModal}>×</button>
      <span class="eyebrow">WALLET-GATED WHISTLEBLOWING</span>
      <h2 id="report-title">Create tamper-evident proof</h2>
      <p>The report and evidence are hashed locally, encrypted before off-chain browser storage, and can be anchored through your wallet when a registry contract is configured.</p>

      {#if !user}
        <p class="limit-warning">Sign in with the header wallet button before submitting a report.</p>
      {:else if quota}
        <div class="quota-line">
          <span>{quota.plan} plan</span>
          <strong>{quota.remaining} of {quota.limit} report generations left</strong>
          <a href="/plans">Manage plan</a>
        </div>
      {/if}

      {#if quota?.blocked && !reportHash}
        <p class="limit-warning">You have used all {quota.limit} whistleblower report attempts on the {quota.plan} plan. Upgrade your plan to submit or test another report.</p>
      {/if}

      <label for="report">Report content</label>
      <textarea
        id="report"
        bind:value={report}
        oninput={() => { reportHash = ''; riskAnalysis = null; saved = false; }}
        placeholder="Describe what happened without identifying yourself…"
        disabled={quota?.blocked && !reportHash}
      ></textarea>

      <div class="evidence-upload">
        <div>
          <strong>Evidence attachments</strong>
          <small>Up to 5 files · 10 MB each · hashed before storage</small>
        </div>
        <label class="upload-button" for="evidence">{processingEvidence ? 'Reading file…' : '+ Add files'}</label>
        <input id="evidence" type="file" multiple onchange={addEvidence} disabled={processingEvidence || (quota?.blocked && !reportHash)}/>
      </div>

      {#each evidenceFiles as file}
        <div class="hash"><strong>{file.name}</strong><small>{extractionLabel(file)}</small><code>{file.hash}</code></div>
      {/each}

      <p class="quota-note">Risk analysis sends the typed report and locally extracted TXT, JSON, or PDF text to GonkaRouter. Original files remain local and are encrypted before storage.</p>
      <button class="full primary" onclick={generate} disabled={(!report.trim() && !evidenceFiles.length) || processingEvidence || busy || quota?.blocked}>
        {busy ? 'Generating commitment and assessing risk…' : 'Generate report + evidence hash · uses 1 attempt'}
      </button>

      {#if reportHash}
        <div class="hash">
          <small>Combined SHA-256 commitment</small>
          <code>{reportHash}</code>
        </div>
        <p class="quota-note">This completed form will be cleared when you close it, so the next report starts empty.</p>
        {#if riskAnalysis}
          <div class="report-risk">
            <small>REPORT RISK ASSESSMENT</small>
            <strong class={`risk-${riskAnalysis.riskLevel}`}>{riskAnalysis.riskLevel}</strong>
            <span>{riskAnalysis.confidence} confidence · truth score {riskAnalysis.truthScore}%</span>
            <p>{riskAnalysis.summary}</p>
          </div>
        {/if}
        <button class="full primary" onclick={save} disabled={saved || busy}>{saved ? 'Encrypted proof saved' : 'Encrypt and save off-chain'}</button>
        <button class="full primary" onclick={anchor} disabled={busy}>{txHash ? 'Attestation submitted' : 'Anchor hash on testnet'}</button>
        <button class="full primary" onclick={copyDisclosure}>Copy disclosure JSON</button>
        <button class="full" onclick={downloadDisclosure}>Download disclosure JSON</button>
        {#if disclosureStatus}<p class="disclosure-status" aria-live="polite">{disclosureStatus}</p>{/if}
      {/if}

      {#if txHash}<div class="hash"><small>Attestation transaction</small><code>{txHash}</code></div>{/if}

      <details bind:open={verifierOpen}>
        <summary>Verify a disclosed report</summary>
        <p class="quota-note">Use this to prove that disclosed report content and evidence hashes still match the original commitment. Preparing your own package fills both fields automatically.</p>
        <label for="expected-hash">Expected report hash</label>
        <input id="expected-hash" bind:value={expectedHash} placeholder="0x…"/>
        <label for="disclosure">Disclosure JSON package</label>
        <textarea id="disclosure" bind:value={disclosure} placeholder="Paste the disclosure JSON package"></textarea>
        <button class="full primary" onclick={verifyDisclosure}>Recompute and verify</button>
        {#if verifyResult}<p>{verifyResult}</p>{/if}
      </details>

      {#if error}<p class="limit-warning">{error}</p>{/if}
    </div>
  </div>
{/if}

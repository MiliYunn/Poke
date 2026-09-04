<script lang="ts">
  import { onMount } from 'svelte';
  import { env } from '$env/dynamic/public';
  import { encodeFunctionData, parseAbi } from 'viem';
  import { extractPdfText } from '$lib/client/pdf';
  import { attestationNetworks, pokeAttestationRegistryAbi, pokeAttestationRegistryBytecode } from '$lib/contracts/pokeAttestationRegistry';

  export let open = false;

  type User = { wallet: string; expiresAt: number };
  type Evidence = { id: string; name: string; size: number; type: string; hash: string; data: string; text?: string; extraction: 'text' | 'no-text' | 'binary' | 'failed' };
  type Quota = { plan: 'free' | 'premium'; used: number; limit: number; remaining: number; blocked: boolean };
  type RiskAnalysis = { truthScore: number; riskLevel: string; confidence: string; scamType: string; summary: string; reasoningTrace?: string[]; evidence: string[]; avoidance?: string[]; protection?: string[]; missingInformation: string[]; disclaimer?: string };
  type EthereumProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  type TransactionReceipt = { status?: string; contractAddress?: string };
  type ReportHistoryRecord = {
    hash: string;
    owner?: string;
    createdAt?: string;
    encrypted?: { ciphertext: string; iv: string };
    storage?: 'indexeddb';
    metadata?: { hasTypedReport: boolean; riskLevel?: string; confidence?: string; truthScore?: number; scamType?: string; assessment?: RiskAnalysis | null; evidence: Array<{ name: string; size: number; type: string; hash: string }> };
    attestation?: { chainId: number; network: string; contract: string; transactionHash: string };
  };
  type HistoricalReportDetail = { report?: string; evidence?: Evidence[]; riskAssessment?: RiskAnalysis | null };
  type ReportVaultEntry = { id: string; owner: string; hash: string; ciphertext: string; iv: string; key: string; createdAt: string };

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
  let attemptConsumed = false;
  let wasOpen = false;
  let riskAnalysis: RiskAnalysis | null = null;
  let processingEvidence = false;
  let registryAddress = '';
  let registryNetwork = '';
  let registryChainId = 0;
  let deploymentTxHash = '';
  let deployingRegistry = false;
  let reportHistory: ReportHistoryRecord[] = [];
  let selectedHistoryHash = '';
  let historyDetail: HistoricalReportDetail | null = null;
  let historyMessage = '';

  const abi = parseAbi([...pokeAttestationRegistryAbi]);
  const addressPattern = /^0x[a-fA-F0-9]{40}$/;
  const zeroHash = `0x${'0'.repeat(64)}` as `0x${string}`;
  const hex = (buffer: ArrayBuffer) => '0x' + [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const b64 = (bytes: Uint8Array) => {
    let value = '';
    for (let i = 0; i < bytes.length; i += 32768) value += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(value);
  };
  const fromB64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  const vaultId = (hash: string, owner = user?.wallet || '') => `${owner.toLowerCase()}:${hash.toLowerCase()}`;

  function openReportVault() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('poke-private-report-vault', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('reports')) request.result.createObjectStore('reports', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open the local report vault.'));
    });
  }

  async function putVaultEntry(entry: ReportVaultEntry) {
    const database = await openReportVault();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('reports', 'readwrite');
      transaction.objectStore('reports').put(entry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not save the encrypted report.'));
    });
    database.close();
  }

  async function getVaultEntry(record: ReportHistoryRecord) {
    const database = await openReportVault();
    const entry = await new Promise<ReportVaultEntry | undefined>((resolve, reject) => {
      const request = database.transaction('reports', 'readonly').objectStore('reports').get(vaultId(record.hash, record.owner));
      request.onsuccess = () => resolve(request.result as ReportVaultEntry | undefined);
      request.onerror = () => reject(request.error || new Error('Could not read the encrypted report.'));
    });
    database.close();
    return entry;
  }

  async function decryptHistoricalDetail(ciphertext: string, iv: string, encodedKey: string) {
    const key = await crypto.subtle.importKey('raw', fromB64(encodedKey), { name: 'AES-GCM' }, false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ciphertext));
    return JSON.parse(new TextDecoder().decode(plaintext)) as HistoricalReportDetail;
  }

  function syncQuota(next: Quota) {
    quota = next;
    localStorage.setItem('poke-report-usage', String(next.used));
  }

  const provider = () => (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  const registryStorageKey = (chainId: number) => `poke-attestation-contract:${chainId}`;

  async function currentNetwork(ethereum: EthereumProvider) {
    const chainId = Number.parseInt(String(await ethereum.request({ method: 'eth_chainId' })), 16);
    return { chainId, name: attestationNetworks[chainId] || `Unsupported chain ${chainId}` };
  }

  async function waitForReceipt(ethereum: EthereumProvider, transactionHash: string) {
    let receipt: TransactionReceipt | null = null;
    for (let attempt = 0; attempt < 120 && !receipt; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      receipt = await ethereum.request({ method: 'eth_getTransactionReceipt', params: [transactionHash] }) as TransactionReceipt | null;
    }
    return receipt;
  }

  async function loadRegistryAddress() {
    const configured = env.PUBLIC_ATTESTATION_CONTRACT || '';
    const ethereum = provider();
    const network = ethereum ? await currentNetwork(ethereum) : null;
    if (addressPattern.test(configured)) {
      registryAddress = configured;
      registryNetwork = network?.name || 'configured testnet';
      registryChainId = network?.chainId || 0;
      return configured;
    }
    if (!ethereum || !network) {
      registryAddress = '';
      registryNetwork = '';
      registryChainId = 0;
      return '';
    }
    registryNetwork = network.name;
    registryChainId = network.chainId;
    registryAddress = localStorage.getItem(registryStorageKey(network.chainId)) || '';
    return addressPattern.test(registryAddress) ? registryAddress : '';
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
    loadReportHistory();
    await loadRegistryAddress().catch(() => { registryAddress = ''; });
  }

  function loadReportHistory() {
    const records = JSON.parse(localStorage.getItem('poke-reports') || '[]') as ReportHistoryRecord[];
    reportHistory = user ? records.filter((record) => !record.owner || record.owner.toLowerCase() === user?.wallet.toLowerCase()) : [];
  }

  async function viewHistoricalReport(record: ReportHistoryRecord) {
    selectedHistoryHash = record.hash;
    historyDetail = null;
    historyMessage = '';
    try {
      const vaultEntry = await getVaultEntry(record);
      if (vaultEntry) {
        historyDetail = await decryptHistoricalDetail(vaultEntry.ciphertext, vaultEntry.iv, vaultEntry.key);
        historyMessage = 'All encrypted report data was decrypted from this browser’s persistent local vault.';
        return;
      }

      // One-time migration path for records created by the previous session-key implementation.
      const legacyKey = sessionStorage.getItem(`poke-report-key:${record.hash}`);
      if (record.encrypted && legacyKey) {
        historyDetail = await decryptHistoricalDetail(record.encrypted.ciphertext, record.encrypted.iv, legacyKey);
        await putVaultEntry({ id: vaultId(record.hash, record.owner), owner: record.owner || '', hash: record.hash, ciphertext: record.encrypted.ciphertext, iv: record.encrypted.iv, key: legacyKey, createdAt: record.createdAt || new Date().toISOString() });
        historyMessage = 'All report data was decrypted and migrated into the persistent local vault.';
        return;
      }

      historyMessage = 'This legacy report was saved with a temporary key that is no longer available. Encryption prevents recovering its original content. Generate and save it once more; new reports remain fully available in history.';
    } catch {
      historyMessage = 'The saved report could not be decrypted. Its unencrypted result metadata is still shown below.';
    }
  }

  function historicalAssessment(record: ReportHistoryRecord) {
    return historyDetail?.riskAssessment || record.metadata?.assessment || null;
  }

  function historicalDisclosure(record: ReportHistoryRecord) {
    if (!historyDetail) return '';
    return JSON.stringify({
      version: 2,
      commitment: {
        version: 1,
        report: historyDetail.report || '',
        evidence: (historyDetail.evidence || []).map(({ name, size, type, hash }) => ({ name, size, type, sha256: hash }))
      },
      attestation: record.attestation || null
    }, null, 2);
  }

  async function copyHistoricalDisclosure(record: ReportHistoryRecord) {
    const packageText = historicalDisclosure(record);
    if (!packageText) {
      historyMessage = 'The disclosure JSON is encrypted and cannot be reconstructed without this report’s session key.';
      return;
    }
    try {
      await navigator.clipboard.writeText(packageText);
      historyMessage = 'Historical disclosure JSON copied to the clipboard.';
    } catch {
      historyMessage = 'Clipboard access was unavailable. Select the disclosure JSON below and copy it manually.';
    }
  }

  function downloadHistoricalDisclosure(record: ReportHistoryRecord) {
    const packageText = historicalDisclosure(record);
    if (!packageText) {
      historyMessage = 'The disclosure JSON is encrypted and cannot be downloaded without this report’s session key.';
      return;
    }
    const url = URL.createObjectURL(new Blob([packageText], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `poke-disclosure-${record.hash.slice(2, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    historyMessage = 'Historical disclosure JSON downloaded.';
  }

  function historicalEvidenceBlob(file: Evidence) {
    return new Blob([fromB64(file.data)], { type: file.type || 'application/octet-stream' });
  }

  function openHistoricalEvidence(file: Evidence) {
    const url = URL.createObjectURL(historicalEvidenceBlob(file));
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function downloadHistoricalEvidence(file: Evidence) {
    const url = URL.createObjectURL(historicalEvidenceBlob(file));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    historyMessage = `${file.name} was decrypted and downloaded from local history.`;
  }

  function resetForm() {
    report = '';
    reportHash = '';
    evidenceFiles = [];
    saved = false;
    txHash = '';
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

  const disclosurePackage = () => JSON.stringify({
    version: 2,
    commitment: JSON.parse(commitment()),
    attestation: registryAddress ? {
      chainId: registryChainId || null,
      network: registryNetwork || null,
      contract: registryAddress,
      transactionHash: txHash || null
    } : null
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

  async function saveEncryptedDetail(hash: string, owner: string) {
    const encrypted = await encryptedRecord();
    await putVaultEntry({
      id: vaultId(hash, owner),
      owner,
      hash,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      key: encrypted.key,
      createdAt: new Date().toISOString()
    });
    return encrypted;
  }

  async function save() {
    await refresh();
    if (!user || !reportHash) return;
    busy = true;
    error = '';
    try {
      await saveEncryptedDetail(reportHash, user.wallet);
      const records = JSON.parse(localStorage.getItem('poke-reports') || '[]') as Array<Record<string, unknown>>;
      const record = {
        hash: reportHash,
        owner: user.wallet,
        storage: 'indexeddb',
        createdAt: new Date().toISOString(),
        metadata: {
          hasTypedReport: Boolean(report.trim()),
          riskLevel: riskAnalysis?.riskLevel,
          confidence: riskAnalysis?.confidence,
          truthScore: riskAnalysis?.truthScore,
          scamType: riskAnalysis?.scamType,
          assessment: riskAnalysis,
          evidence: evidenceFiles.map(({ name, size, type, hash }) => ({ name, size, type, hash }))
        },
        quota
      };
      localStorage.setItem('poke-reports', JSON.stringify([record, ...records.filter((item) => item.hash !== reportHash)].slice(0, 30)));
      loadReportHistory();
      saved = true;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Could not encrypt and save the report.';
    } finally {
      busy = false;
    }
  }

  async function deployRegistry() {
    await refresh();
    const ethereum = provider();
    if (!user) {
      error = 'Sign in with your wallet before deploying the testnet registry.';
      return;
    }
    if (!ethereum) {
      error = 'MetaMask is required to deploy the testnet registry.';
      return;
    }

    busy = true;
    deployingRegistry = true;
    error = '';
    disclosureStatus = '';
    try {
      const network = await currentNetwork(ethereum);
      if (!attestationNetworks[network.chainId]) {
        throw new Error('Switch MetaMask to Ethereum Sepolia, Base Sepolia, or Polygon Amoy first.');
      }
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      if (accounts[0]?.toLowerCase() !== user.wallet.toLowerCase()) {
        throw new Error('Use the same MetaMask wallet that signed in to Poké.');
      }
      deploymentTxHash = String(await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: accounts[0], data: pokeAttestationRegistryBytecode }]
      }));

      const receipt = await waitForReceipt(ethereum, deploymentTxHash);
      if (!receipt) throw new Error('Registry deployment is still pending. Wait for confirmation in MetaMask, then reopen this panel.');
      if (receipt.status === '0x0') throw new Error('Registry deployment reverted on the selected testnet.');
      if (!addressPattern.test(receipt.contractAddress || '')) throw new Error('The deployment receipt did not contain a registry address.');

      registryAddress = receipt.contractAddress as string;
      registryNetwork = network.name;
      registryChainId = network.chainId;
      localStorage.setItem(registryStorageKey(network.chainId), registryAddress);
      disclosureStatus = `Registry deployed on ${network.name}. You can now anchor this report hash.`;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Could not deploy the testnet registry.';
    } finally {
      deployingRegistry = false;
      busy = false;
    }
  }

  async function anchor() {
    await refresh();
    if (!user || !reportHash) {
      error = 'Sign in and generate the proof first.';
      return;
    }
    const ethereum = provider();
    if (!ethereum) {
      error = 'MetaMask is required to anchor the proof.';
      return;
    }
    busy = true;
    error = '';
    try {
      const network = await currentNetwork(ethereum);
      if (!attestationNetworks[network.chainId]) throw new Error('Switch MetaMask to Ethereum Sepolia, Base Sepolia, or Polygon Amoy first.');
      const contract = await loadRegistryAddress();
      if (!contract) throw new Error('Deploy the testnet registry first, then anchor the report hash.');
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      if (accounts[0]?.toLowerCase() !== user.wallet.toLowerCase()) throw new Error('Use the same wallet that signed in to Poké.');
      const data = encodeFunctionData({ abi, functionName: 'attest', args: [reportHash as `0x${string}`, zeroHash] });
      txHash = String(await ethereum.request({ method: 'eth_sendTransaction', params: [{ from: accounts[0], to: contract, data }] }));
      disclosureStatus = `Attestation submitted on ${network.name}. Waiting for testnet confirmation…`;
      const receipt = await waitForReceipt(ethereum, txHash);
      if (!receipt) throw new Error('Attestation is still pending. Check the transaction hash in the testnet explorer.');
      if (receipt.status === '0x0') throw new Error('The attestation transaction reverted on the selected testnet.');
      const records = JSON.parse(localStorage.getItem('poke-reports') || '[]') as ReportHistoryRecord[];
      const attestation = { chainId: network.chainId, network: network.name, contract, transactionHash: txHash };
      const metadata = { hasTypedReport: Boolean(report.trim()), riskLevel: riskAnalysis?.riskLevel, confidence: riskAnalysis?.confidence, truthScore: riskAnalysis?.truthScore, scamType: riskAnalysis?.scamType, assessment: riskAnalysis, evidence: evidenceFiles.map(({ name, size, type, hash }) => ({ name, size, type, hash })) };
      const existingRecord = records.find((record) => record.hash === reportHash);
      if (!existingRecord?.storage) await saveEncryptedDetail(reportHash, user.wallet);
      const anchoredRecords = records.some((record) => record.hash === reportHash)
        ? records.map((record) => record.hash === reportHash ? { ...record, storage: 'indexeddb' as const, metadata, attestation } : record)
        : [{ hash: reportHash, owner: user.wallet, storage: 'indexeddb' as const, createdAt: new Date().toISOString(), metadata, attestation }, ...records].slice(0, 30);
      localStorage.setItem('poke-reports', JSON.stringify(anchoredRecords));
      loadReportHistory();
      disclosureStatus = `Hash anchored and confirmed on ${network.name}. Keep the transaction hash with the disclosure package.`;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Attestation transaction failed.';
    } finally {
      busy = false;
    }
  }

  async function copyDisclosure() {
    const packageText = disclosurePackage();
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
    const packageText = disclosurePackage();
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
      const disclosedCommitment = parsed?.version === 2 && parsed.commitment ? parsed.commitment : parsed;
      const canonical = JSON.stringify(disclosedCommitment);
      const actual = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
      if (actual.toLowerCase() !== expectedHash.trim().toLowerCase()) {
        verifyResult = `Mismatch — recomputed ${actual}`;
        return;
      }
      let chain = 'Hash matches the disclosed package.';
      const ethereum = provider();
      if (ethereum) {
        const network = await currentNetwork(ethereum);
        const disclosedContract = String(parsed?.attestation?.contract || '');
        const disclosedChainId = Number(parsed?.attestation?.chainId) || 0;
        if (disclosedChainId && disclosedChainId !== network.chainId) {
          verifyResult = `${chain} Switch MetaMask to ${attestationNetworks[disclosedChainId] || `chain ${disclosedChainId}`} to check its on-chain attestation.`;
          return;
        }
        const contract = addressPattern.test(disclosedContract) ? disclosedContract : await loadRegistryAddress();
        if (contract) {
          const data = encodeFunctionData({ abi, functionName: 'verify', args: [actual as `0x${string}`] });
          const result = String(await ethereum.request({ method: 'eth_call', params: [{ to: contract, data }, 'latest'] }));
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
      <p>The report and evidence are hashed locally, encrypted in this browser’s persistent local vault, and can be anchored through your wallet when a registry contract is configured.</p>

      {#if !user}
        <p class="limit-warning">Sign in with the header wallet button before submitting a report.</p>
      {:else if quota}
        <div class="quota-line">
          <span>{quota.plan} plan</span>
          <strong>{quota.remaining} of {quota.limit} report generations left</strong>
          <a href="/plans">Manage plan</a>
        </div>
      {/if}

      {#if user}
        <details class="history-panel report-history">
          <summary>Saved report history <span>{reportHistory.length}</span></summary>
          {#if reportHistory.length}
            <div class="history-list">
              {#each reportHistory as item}
                <button class:active={selectedHistoryHash === item.hash} onclick={() => viewHistoricalReport(item)}>
                  <span class={`history-risk risk-${item.metadata?.riskLevel || 'unknown'}`}>{item.metadata?.riskLevel || 'saved'}</span>
                  <strong>{item.metadata?.scamType || 'Whistleblower report'}</strong>
                  <small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Date unavailable'} · {item.metadata?.evidence?.length || 0} evidence file(s)</small>
                  <code>{item.hash}</code>
                  <em>View saved result →</em>
                </button>
              {/each}
            </div>
            {#if selectedHistoryHash}
              {@const selectedRecord = reportHistory.find((item) => item.hash === selectedHistoryHash)}
              {#if selectedRecord}
                {@const assessment = historicalAssessment(selectedRecord)}
                {@const historicalJson = historicalDisclosure(selectedRecord)}
                <section class="history-detail">
                  <p>{historyMessage}</p>
                  <div class="history-section"><h4>Expected report hash</h4><code class="history-full-hash">{selectedRecord.hash}</code><small>Created {selectedRecord.createdAt ? new Date(selectedRecord.createdAt).toLocaleString() : 'at an unavailable date'}</small></div>
                  {#if assessment}
                    <div class="history-stats"><strong>{assessment.riskLevel || 'Unknown'} risk</strong><span>{assessment.confidence || 'unknown'} confidence · truth score {assessment.truthScore ?? 0}% · {assessment.scamType || 'unclassified'}</span></div>
                    <div class="history-section"><h4>Assessment summary</h4><p>{assessment.summary}</p></div>
                    {#if assessment.reasoningTrace?.length}<div class="history-section"><h4>Reasoning trace</h4><ol>{#each assessment.reasoningTrace as item}<li>{item}</li>{/each}</ol></div>{/if}
                    {#if assessment.evidence?.length}<div class="history-section"><h4>Evidence and indicators</h4><ul>{#each assessment.evidence as item}<li>{item}</li>{/each}</ul></div>{/if}
                    {#if assessment.missingInformation?.length}<div class="history-section"><h4>Missing information</h4><ul>{#each assessment.missingInformation as item}<li>{item}</li>{/each}</ul></div>{/if}
                    {#if assessment.avoidance?.length}<div class="history-section"><h4>Avoidance guidance</h4><ul>{#each assessment.avoidance as item}<li>{item}</li>{/each}</ul></div>{/if}
                    {#if assessment.protection?.length}<div class="history-section"><h4>Immediate protection</h4><ul>{#each assessment.protection as item}<li>{item}</li>{/each}</ul></div>{/if}
                    {#if assessment.disclaimer}<div class="history-section"><h4>Limitation</h4><p>{assessment.disclaimer}</p></div>{/if}
                  {/if}
                  {#if historyDetail}<div class="history-section"><h4>Report content</h4><pre>{historyDetail.report || 'No typed report content was supplied.'}</pre></div>{/if}
                  <div class="history-section">
                    <h4>Evidence attachments</h4>
                    {#if historyDetail?.evidence?.length}
                      {#each historyDetail.evidence as file}
                        <div class="history-evidence">
                          <strong>{file.name}</strong>
                          <small>{file.type} · {file.size} bytes · {extractionLabel(file)}</small>
                          <code>{file.hash}</code>
                          {#if file.text}<details class="history-extracted"><summary>View extracted content</summary><pre>{file.text}</pre></details>{/if}
                          <div class="history-actions"><button onclick={() => openHistoricalEvidence(file)}>Open file</button><button onclick={() => downloadHistoricalEvidence(file)}>Download original</button></div>
                        </div>
                      {/each}
                    {:else if selectedRecord.metadata?.evidence?.length}
                      {#each selectedRecord.metadata.evidence as file}<div class="history-evidence"><strong>{file.name}</strong><small>{file.type} · {file.size} bytes · original file is locked</small><code>{file.hash}</code></div>{/each}
                    {:else}<p>No saved attachment data is available for this legacy entry.</p>{/if}
                  </div>
                  <div class="history-section"><h4>On-chain anchoring</h4>{#if selectedRecord.attestation}<div class="history-evidence"><strong>{selectedRecord.attestation.network} · chain {selectedRecord.attestation.chainId}</strong><small>Registry contract</small><code>{selectedRecord.attestation.contract}</code><small>Attestation transaction</small><code>{selectedRecord.attestation.transactionHash}</code></div>{:else}<p>This saved report has no confirmed testnet anchor.</p>{/if}</div>
                  <div class="history-section"><h4>Disclosure JSON package</h4>{#if historicalJson}<textarea readonly value={historicalJson}></textarea><div class="history-actions"><button onclick={() => copyHistoricalDisclosure(selectedRecord)}>Copy JSON</button><button onclick={() => downloadHistoricalDisclosure(selectedRecord)}>Download JSON</button></div>{:else}<p>This legacy entry cannot be reconstructed because its old temporary encryption key was already erased.</p>{/if}</div>
                </section>
              {/if}
            {/if}
          {:else}
            <p class="history-empty">No encrypted reports saved in this browser yet. Use “Encrypt and save off-chain” after generating a report.</p>
          {/if}
        </details>
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

      <p class="quota-note">Risk analysis sends the typed report and locally extracted TXT, JSON, or PDF text to GonkaRouter. Original files remain on this device and are encrypted in browser storage so history can decrypt and reopen them later.</p>
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
        {#if registryAddress}
          <div class="hash registry-ready">
            <small>ATTESTATION REGISTRY · {registryNetwork}</small>
            <code>{registryAddress}</code>
          </div>
          <button class="full primary" onclick={anchor} disabled={busy || Boolean(txHash)}>{txHash ? 'Hash anchored on testnet' : 'Anchor hash on testnet'}</button>
        {:else}
          <p class="quota-note">A registry contract is required once per testnet. Deploying uses testnet gas and requires MetaMask confirmation; your report content is never included.</p>
          <button class="full primary" onclick={deployRegistry} disabled={busy}>
            {deployingRegistry ? 'Deploying registry — waiting for confirmation…' : 'Deploy testnet registry (one time)'}
          </button>
          <button class="full" disabled>Anchor hash on testnet · deploy registry first</button>
        {/if}
        <button class="full primary" onclick={copyDisclosure}>Copy disclosure JSON</button>
        <button class="full" onclick={downloadDisclosure}>Download disclosure JSON</button>
        {#if disclosureStatus}<p class="disclosure-status" aria-live="polite">{disclosureStatus}</p>{/if}
      {/if}

      {#if deploymentTxHash}<div class="hash"><small>Registry deployment transaction</small><code>{deploymentTxHash}</code></div>{/if}
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

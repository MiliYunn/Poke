<script lang="ts">
  import { onMount } from 'svelte';
  import { extractPdfText } from '$lib/client/pdf';

  type Message = { role: 'user' | 'assistant'; content: string; model?: string; requestId?: string };
  type SavedReport = {
    hash: string;
    report?: string;
    evidence?: Array<Record<string, unknown>>;
    riskAssessment?: Record<string, unknown> | null;
    encrypted?: { ciphertext: string; iv: string };
    createdAt?: string;
  };

  let open = false;
  let input = '';
  let loading = false;
  let messages: Message[] = [{ role: 'assistant', content: 'Ask about the current Poké page, wallet, chain, verification evidence, or Web3 safety.' }];

  const fromB64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

  onMount(() => {
    const saved = localStorage.getItem('poke-chat');
    if (saved) try { messages = JSON.parse(saved); } catch { /* Ignore invalid local history. */ }
  });

  async function decryptReport(record: SavedReport) {
    if (record.report || record.evidence || record.riskAssessment) return record;
    if (!record.encrypted) return null;
    const encodedKey = sessionStorage.getItem(`poke-report-key:${record.hash}`);
    if (!encodedKey) return null;

    const key = await crypto.subtle.importKey('raw', fromB64(encodedKey), { name: 'AES-GCM' }, false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(record.encrypted.iv) },
      key,
      fromB64(record.encrypted.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as SavedReport;
  }

  async function safeEvidence(evidence: Array<Record<string, unknown>> | undefined) {
    const results = [];
    for (const file of evidence || []) {
      let extractedText = typeof file.text === 'string' ? file.text.slice(0, 1200) : '';
      const isPdf = file.type === 'application/pdf' || (typeof file.name === 'string' && /\.pdf$/i.test(file.name));
      if (!extractedText && isPdf && typeof file.data === 'string') {
        try { extractedText = (await extractPdfText(fromB64(file.data))).slice(0, 1200); } catch { /* Keep integrity metadata when parsing fails. */ }
      }
      results.push({ name: file.name, type: file.type, size: file.size, sha256: file.hash || file.sha256, extractedText: extractedText || undefined });
    }
    return results;
  }

  async function reportLookup(question: string, reports: SavedReport[]) {
    const hash = question.match(/0x[a-fA-F0-9]{64}/)?.[0]?.toLowerCase();
    if (!hash) return `Recent saved report metadata: ${JSON.stringify(reports.slice(0, 3).map(({ hash: reportHash, createdAt, riskAssessment }) => ({ hash: reportHash, createdAt, riskAssessment })))}.`;

    const record = reports.find((item) => item.hash?.toLowerCase() === hash);
    if (!record) return `No saved local whistleblower report matches ${hash}. A hash alone proves integrity and does not reveal risk.`;

    try {
      const decrypted = await decryptReport(record);
      if (!decrypted) return `A matching encrypted report exists for ${hash}, but its session recovery key is unavailable. The report cannot be decrypted safely in this browser session.`;
      return `Authorized locally decrypted report for ${hash}: ${JSON.stringify({
        report: decrypted.report?.slice(0, 2600),
        evidence: (await safeEvidence(decrypted.evidence)).slice(0, 5),
        riskAssessment: decrypted.riskAssessment || record.riskAssessment || null
      })}. State the stored risk level when riskAssessment is present. If it is absent, provide a clearly labeled risk assessment using only this decrypted report and extracted evidence. Do not say the report is inaccessible.`;
    } catch {
      return `A matching encrypted report exists for ${hash}, but local decryption failed. Do not infer a risk level from the hash alone.`;
    }
  }

  async function send() {
    if (!input.trim() || loading) return;
    const text = input.trim();
    messages = [...messages, { role: 'user', content: text }];
    input = '';
    loading = true;
    try {
      const scans = JSON.parse(localStorage.getItem('poke-scam-scans') || '[]');
      const reports = JSON.parse(localStorage.getItem('poke-reports') || '[]') as SavedReport[];
      const reportContext = await reportLookup(text, reports);
      const context = `Current screen source: ${location.pathname}. Latest cached scam verification: ${JSON.stringify(scans[0] || null).slice(0, 1800)}. Saved local record lookup: ${reportContext} Cite report facts as Saved local record and cached scan facts as Current screen context. A bare hash without a matching/decrypted record proves integrity only.`;
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: context }, ...messages.slice(-10).map(({ role, content }) => ({ role, content }))] })
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error);
      }

      const assistant: Message = { role: 'assistant', content: '' };
      messages = [...messages, assistant];
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split('\n');
        pending = lines.pop() || '';
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.delta) {
            assistant.content += event.delta;
            messages = [...messages.slice(0, -1), { ...assistant }];
          }
          if (event.done) {
            assistant.model = event.model;
            assistant.requestId = event.requestId;
            messages = [...messages.slice(0, -1), { ...assistant }];
          }
        }
      }
      localStorage.setItem('poke-chat', JSON.stringify(messages.slice(-20)));
    } catch {
      messages = [...messages, { role: 'assistant', content: 'The assistant is temporarily unavailable.' }];
    } finally {
      loading = false;
    }
  }
</script>
<button class="chat-fab" onclick={()=>open=!open}><span>✦</span><div><strong>Chatbot corner</strong><small>Persistent · GonkaRouter</small></div><b>↑</b></button>
{#if open}<section class="chat"><header><div><span>✦</span><div><strong>Poké assistant</strong><small>Context: {typeof location==='undefined'?'/':location.pathname}</small></div></div><button onclick={()=>open=false}>×</button></header><div class="messages" aria-live="polite">{#each messages as message}<p class={message.role}>{message.content}{#if message.model}<small class="chat-proof">Source: Current screen context · {message.model} · {message.requestId}</small>{/if}</p>{/each}{#if loading}<p>Streaming a sourced answer…</p>{/if}</div><form onsubmit={(e)=>{e.preventDefault();send()}}><input bind:value={input} aria-label="Chat message" placeholder="Ask about this view…"/><button disabled={loading}>↑</button></form></section>{/if}

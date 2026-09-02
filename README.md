# Poké — Gonka-powered Web3 truth engine

Poké is an independently implemented SvelteKit command center for public-interest Web3 verification. It combines portfolio and transaction exploration, evidence-first scam analysis, whistleblower integrity proofs, and a traceable claim-verification workflow. Blockhead was used only as a product-scope reference; no source code was copied or reused.

## Local setup

1. Copy `.env.example` to `.env` and add a newly rotated GonkaRouter key.
2. Run `npm install`.
3. Run `npm run dev`.

Never commit `.env`. The MVP targets Ethereum Sepolia, Base Sepolia, and Polygon Amoy.

## GonkaRouter integration

All AI requests originate on the server and pass through `src/lib/server/ai/AIGateway.ts`. Feature code never calls another AI provider. The gateway sends OpenAI-compatible requests to `https://api.gonkarouter.io/v1/chat/completions` and keeps `GONKA_API_KEY` out of browser code.

The `/verify` workflow performs:

1. Safe retrieval of the public URLs supplied by the user.
2. Claim extraction through the configured Gonka model.
3. Evidence-based verification through Gonka.
4. A 0–100 Truth Score, verdict, supporting and contradicting evidence, limitations, citations, and an auditable reasoning trace.
5. Display of the model and Gonka response Request ID for every inference step.

Set `GONKA_CONSENSUS_MODEL` to a second, different model available on your GonkaRouter account to enable independent cross-verification. Poké averages both scores and marks the result as disputed when they differ by more than 25 points. If it is not configured, the UI clearly labels the result as single-model verification.

Poké never presents private model chain-of-thought. Its reasoning trace is an auditable evidence record: what was checked, what the available evidence establishes, which source was used, and what remains unknown.

## Environment

```env
GONKA_API_KEY=your_rotated_server_side_key
GONKA_MODEL=deepseek-ai/DeepSeek-V4-Flash-0731
GONKA_CONSENSUS_MODEL=another_gonka_hosted_model
GONKA_BASE_URL=https://api.gonkarouter.io/v1
```

Use a newly rotated key. Never commit `.env`, expose a key in the UI, or include one in a demo recording.

## Verification API

`POST /api/ai/verify`

```json
{
  "input": "A factual statement, public webpage URL, or pasted tweet text",
  "sourceUrls": ["https://public-evidence.example/article"]
}
```

The response contains `claims`, retrieved-source status, `result.truthScore`, evidence, reasoning trace, consensus metadata, and `runs`. Each `runs` entry contains the inference stage, Gonka model, and Request ID returned by the inference gateway.

## Hackathon demo flow

1. Open **Verify**.
2. Paste a claim or public article URL and add any supporting or conflicting evidence links.
3. Run verification and explain the Truth Score.
4. Expand the evidence, uncertainty, and reasoning sections.
5. Show the Gonka model and Request ID for each inference.
6. If a second model is configured, show the consensus or disagreement result.

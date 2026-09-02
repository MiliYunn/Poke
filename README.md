# Poké — Web3 command center powered by Gonka

Poké is an independently implemented SvelteKit Web3 command center. It combines cross-chain portfolio and explorer tools, evidence-first scam analysis, whistleblower integrity proofs, and a context-aware assistant. Blockhead was used only as a product-scope reference; no source code was copied or reused.

## Local setup

1. Copy `.env.example` to `.env` and add a newly rotated GonkaRouter key.
2. Run `npm install`.
3. Run `npm run dev`.

Never commit `.env`. The MVP targets Ethereum Sepolia, Base Sepolia, and Polygon Amoy.

## GonkaRouter integration

All AI requests originate on the server and pass through `src/lib/server/ai/AIGateway.ts`. Scam Detection and Chatbot Corner do not call another AI provider. The gateway sends OpenAI-compatible requests to `https://api.gonkarouter.io/v1/chat/completions` and keeps `GONKA_API_KEY` outside browser code.

Scam Detection shows:

- Risk level, confidence, and likely scam type
- Evidence and missing information
- Separate avoidance and immediate protection guidance
- The Gonka model and Request ID returned for the inference

Chatbot Corner is restricted to Poké’s wallet, EVM chain, transaction, portfolio, scam-evidence, whistleblower, and Web3 safety topics. It must not infer report risk from a hash alone or invent facts that are not present on screen.

## Environment

```env
GONKA_API_KEY=your_rotated_server_side_key
GONKA_MODEL=deepseek-ai/DeepSeek-V4-Flash-0731
GONKA_BASE_URL=https://api.gonkarouter.io/v1
PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
PUBLIC_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
PUBLIC_POLYGON_AMOY_RPC_URL=https://polygon-amoy.drpc.org
SESSION_SECRET=replace_with_at_least_32_random_characters
```

Use a newly rotated key. Never commit `.env`, expose a key in the UI, or include one in a demo recording.

## Wallet sign-in

Wallet authentication asks MetaMask for the selected address, creates a five-minute server challenge, and requests a message signature. The signature does not send a transaction or cost gas. The server verifies it and creates a seven-day signed session. Set a strong `SESSION_SECRET` outside local development.

## Hackathon demo flow

1. Enter a wallet address and inspect balances on the three testnets.
2. Open Explorer and inspect a block or transaction.
3. Submit suspicious content to Scam Detection and show its evidence, safety guidance, Gonka model, and Request ID.
4. Create a whistleblower report and hash its evidence files.
5. Ask Chatbot Corner about information currently shown in Poké.

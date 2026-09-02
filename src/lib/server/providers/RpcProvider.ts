import { env } from '$env/dynamic/private';
import { chains } from '$lib/config/chains';

const rpcUrls: Record<number, string> = {
  11155111: env.PUBLIC_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  84532: env.PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  80002: env.PUBLIC_POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology'
};

export async function rpc(chainId: number, method: string, params: unknown[]) {
  const url = rpcUrls[chainId];
  if (!url) throw new Error('Unsupported chain');
  const response = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}) });
  if (!response.ok) throw new Error(`RPC returned ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message || 'RPC request failed');
  return body.result;
}

export function chainById(chainId: number) { return chains.find((chain) => chain.id === chainId); }
export function formatUnits(hex: string, decimals = 18) {
  const value = BigInt(hex); const base = 10n ** BigInt(decimals);
  const whole = value / base; const fraction = (value % base).toString().padStart(decimals,'0').slice(0,6).replace(/0+$/,'');
  return `${whole}${fraction ? '.'+fraction : ''}`;
}

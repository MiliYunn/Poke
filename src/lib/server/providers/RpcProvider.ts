import { env } from '$env/dynamic/private';
import { chains } from '$lib/config/chains';

const rpcUrls: Record<number, string[]> = {
  11155111: [env.PUBLIC_SEPOLIA_RPC_URL, 'https://ethereum-sepolia-rpc.publicnode.com'].filter(Boolean) as string[],
  84532: [env.PUBLIC_BASE_SEPOLIA_RPC_URL, 'https://sepolia.base.org'].filter(Boolean) as string[],
  80002: [env.PUBLIC_POLYGON_AMOY_RPC_URL, 'https://polygon-amoy.drpc.org', 'https://rpc-amoy.polygon.technology'].filter(Boolean) as string[]
};

export async function rpc(chainId: number, method: string, params: unknown[]) {
  const urls = [...new Set(rpcUrls[chainId] || [])];
  if (!urls.length) throw new Error('Unsupported chain');
  let lastError='RPC connection failed';
  for(const url of urls){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10_000);
    try{
      const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:controller.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);const body=await response.json();if(body.error)throw new Error(body.error.message||'RPC request failed');return body.result;
    }catch(error){lastError=error instanceof Error&&error.name==='AbortError'?'RPC timed out':error instanceof Error?error.message:'RPC connection failed';}
    finally{clearTimeout(timer);}
  }
  throw new Error(`All ${chainById(chainId)?.name||'network'} RPC providers failed: ${lastError}`);
}

export function chainById(chainId: number) { return chains.find((chain) => chain.id === chainId); }
export function formatUnits(hex: string, decimals = 18) {
  const value = BigInt(hex); const base = 10n ** BigInt(decimals);
  const whole = value / base; const fraction = (value % base).toString().padStart(decimals,'0').slice(0,6).replace(/0+$/,'');
  return `${whole}${fraction ? '.'+fraction : ''}`;
}

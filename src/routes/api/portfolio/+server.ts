import { json } from '@sveltejs/kit';
import { chains } from '$lib/config/chains';
import { formatUnits, rpc } from '$server/providers/RpcProvider';

export const GET = async ({url}) => {
  const address = url.searchParams.get('address')?.trim() || '';
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return json({error:'Enter a valid 0x EVM address. ENS resolution is the next provider adapter.'},{status:400});
  const balances = await Promise.all(chains.map(async chain => {
    try { const hex=await rpc(chain.id,'eth_getBalance',[address,'latest']); return {chainId:chain.id,name:chain.name,symbol:chain.symbol,amount:formatUnits(hex),status:'ok',source:'public-rpc'}; }
    catch(error) { return {chainId:chain.id,name:chain.name,symbol:chain.symbol,amount:'—',status:'error',error:error instanceof Error?error.message:'RPC failed',source:'public-rpc'}; }
  }));
  return json({address,balances,fetchedAt:new Date().toISOString()});
};

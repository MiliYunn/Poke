import { json } from '@sveltejs/kit';
import { chains } from '$lib/config/chains';
import { formatUnits, rpc } from '$server/providers/RpcProvider';
import { resolveHandle } from '$server/providers/HandleResolver';
import { marketPrices } from '$server/providers/MarketPriceProvider';
import { discoverHoldings } from '$server/providers/BlockscoutProvider';

export const GET = async ({url}) => {
  const identity = url.searchParams.get('address')?.trim() || '';
  let address:string;try{address=await resolveHandle(identity);}catch(error){return json({error:error instanceof Error?error.message:'Invalid identity.'},{status:400});}
  const prices=await marketPrices();
  const balances = await Promise.all(chains.map(async chain => {
    try { const hex=await rpc(chain.id,'eth_getBalance',[address,'latest']);const amount=formatUnits(hex);const unitPrice=prices[chain.symbol];return {chainId:chain.id,name:chain.name,symbol:chain.symbol,amount,unitPrice,usdValue:unitPrice===null?null:Number(amount)*unitPrice,status:'ok',source:'public-rpc'}; }
    catch(error) { return {chainId:chain.id,name:chain.name,symbol:chain.symbol,amount:'—',status:'error',error:error instanceof Error?error.message:'RPC failed',source:'public-rpc'}; }
  }));
  const holdings=await Promise.all(chains.map(chain=>discoverHoldings(address,chain.id)));
  const tokens=holdings.flatMap(item=>item.tokens);const nfts=holdings.flatMap(item=>item.nfts);
  const totalUsd=balances.reduce((sum,item)=>sum+(typeof item.usdValue==='number'?item.usdValue:0),0)+tokens.reduce((sum,item)=>sum+(typeof item.usdValue==='number'?item.usdValue:0),0);
  return json({identity,address,balances,tokens,nfts,dataSources:holdings.map((item,index)=>({chainId:chains[index].id,status:item.status,error:item.error})),totalUsd,fetchedAt:new Date().toISOString()});
};

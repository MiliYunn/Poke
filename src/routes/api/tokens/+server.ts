import {json} from '@sveltejs/kit';
import {decodeFunctionResult,encodeFunctionData,formatUnits,getAddress,isAddress,parseAbi} from 'viem';
import {rpc} from '$server/providers/RpcProvider';
import {resolveHandle} from '$server/providers/HandleResolver';
const abi=parseAbi(['function balanceOf(address) view returns (uint256)','function name() view returns (string)','function symbol() view returns (string)','function decimals() view returns (uint8)']);
async function call(chainId:number,to:`0x${string}`,functionName:'name'|'symbol'|'decimals'|'balanceOf',owner?:`0x${string}`){const data=encodeFunctionData({abi,functionName,args:functionName==='balanceOf'?[owner!]:undefined});const value=await rpc(chainId,'eth_call',[{to,data},'latest']);return decodeFunctionResult({abi,functionName,data:value});}
export const POST=async({request})=>{try{
  const {owner,chainId,contracts=[]}=await request.json();const wallet=await resolveHandle(owner);
  const list=(contracts as string[]).filter(value=>isAddress(value)).slice(0,10).map(value=>getAddress(value));
  if(!list.length)return json({error:'Add at least one valid ERC-20 contract.'},{status:400});
  const tokens=await Promise.all(list.map(async contract=>{try{const [name,symbol,decimals,balance]=await Promise.all([call(chainId,contract,'name'),call(chainId,contract,'symbol'),call(chainId,contract,'decimals'),call(chainId,contract,'balanceOf',wallet)]);return{contract,name:String(name),symbol:String(symbol),decimals:Number(decimals),balance:formatUnits(BigInt(String(balance)),Number(decimals)),status:'ok'};}catch(error){return{contract,status:'error',error:error instanceof Error?error.message:'Token query failed'};}}));
  return json({owner:wallet,chainId,tokens,fetchedAt:new Date().toISOString()});
}catch(error){return json({error:error instanceof Error?error.message:'Token discovery failed'},{status:502});}};

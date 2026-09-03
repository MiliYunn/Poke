import { env } from '$env/dynamic/private';
import { createPublicClient, getAddress, http, isAddress } from 'viem';
import { normalize } from 'viem/ens';
import { mainnet } from 'viem/chains';

export async function resolveHandle(input:string){
  const value=input.trim();
  if(isAddress(value))return getAddress(value);
  if(!value.toLowerCase().endsWith('.eth'))throw new Error('Enter an EVM address or ENS name ending in .eth.');
  const client=createPublicClient({chain:mainnet,transport:http(env.ENS_RPC_URL||'https://ethereum-rpc.publicnode.com')});
  const address=await client.getEnsAddress({name:normalize(value)});
  if(!address)throw new Error('That ENS name does not resolve to an address.');
  return address;
}

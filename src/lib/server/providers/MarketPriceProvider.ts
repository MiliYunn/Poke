type Prices={ETH:number|null;POL:number|null};
let cache:{value:Prices;expires:number}|null=null;
export async function marketPrices():Promise<Prices>{
  if(cache&&cache.expires>Date.now())return cache.value;
  try{const response=await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,polygon-ecosystem-token&vs_currencies=usd',{headers:{accept:'application/json'}});if(!response.ok)throw new Error();const body=await response.json();const value={ETH:Number(body.ethereum?.usd)||null,POL:Number(body['polygon-ecosystem-token']?.usd)||null};cache={value,expires:Date.now()+60_000};return value;}catch{return{ETH:null,POL:null};}
}

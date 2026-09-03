import { rpc } from '$server/providers/RpcProvider';
import { inspectContract } from '$server/providers/BlockscoutProvider';

export type Evidence = { id: string; label: string; status: 'pass'|'warning'|'unknown'; detail: string; source: string };
const addressPattern=/^0x[a-fA-F0-9]{40}$/;

export class ScamScoreService {
  async score(input: string, chainId = 11155111, description = '') {
    const target=input.trim();
    const evidence:Evidence[]=[];
    if(addressPattern.test(target)){
      try{
        const [code,transactions,balance]=await Promise.all([rpc(chainId,'eth_getCode',[target,'latest']),rpc(chainId,'eth_getTransactionCount',[target,'latest']),rpc(chainId,'eth_getBalance',[target,'latest'])]);
        const contract=typeof code==='string'&&code!=='0x'&&code!=='0x0';
        evidence.push({id:'target',label:'On-chain target classification',status:'pass',detail:contract?'Deployed contract bytecode found.':'Externally owned wallet; no contract bytecode found.',source:`Chain ${chainId} public RPC`});
        evidence.push({id:'activity',label:'Observed account activity',status:'pass',detail:`Transaction nonce ${Number(transactions)}; native balance ${BigInt(balance)} wei.`,source:`Chain ${chainId} public RPC`});
        const indexed=contract?await inspectContract(target,chainId):null;
        evidence.push({id:'source',label:'Verified source code',status:contract?(indexed?.isVerified?'pass':'warning'):'pass',detail:contract?(indexed?.isVerified?'Explorer reports verified source code.':indexed?'Explorer does not report verified source code.':'Explorer verification data is unavailable.'):'Not applicable to a non-contract wallet.',source:indexed?.sourceUrl||'Poké deterministic check'});
        evidence.push({id:'age',label:'Contract creation evidence',status:contract&&indexed?.creationTransaction?'pass':'unknown',detail:indexed?.creationTransaction?`Creation transaction ${indexed.creationTransaction}`:'Creation transaction was not available.',source:indexed?.sourceUrl||'Poké provider registry'});
        evidence.push({id:'honeypot',label:'Sell simulation',status:contract?'unknown':'pass',detail:contract?'Token ABI and liquidity route are required before a safe sell simulation.':'Not applicable to a non-contract wallet.',source:'Poké deterministic check'});
        evidence.push({id:'holders',label:'Holder distribution',status:indexed?.holdersCount?'pass':'unknown',detail:indexed?.holdersCount?`${indexed.holdersCount} holders reported; concentration percentages require the holder-distribution endpoint.`:'Holder data is unavailable.',source:indexed?.sourceUrl||'Poké provider registry'});
      }catch(error){evidence.push({id:'rpc',label:'On-chain checks',status:'unknown',detail:error instanceof Error?error.message:'RPC checks failed.',source:`Chain ${chainId} public RPC`});}
    }else if(target.includes('.')||/^https?:\/\//i.test(target)){
      let hostname=target;try{hostname=new URL(/^https?:\/\//i.test(target)?target:`https://${target}`).hostname;}catch{}
      const suspicious=/xn--|[а-я]|(?:metamask|uniswap|coinbase|opensea).*(?:claim|bonus|support)|(?:claim|bonus|support).*(?:metamask|uniswap|coinbase|opensea)/i.test(hostname);
      evidence.push({id:'domain',label:'Domain typosquat pattern',status:suspicious?'warning':'pass',detail:suspicious?'Brand/claim wording or internationalized characters require manual verification.':'No obvious local typosquat pattern was detected; this does not establish legitimacy.',source:'Poké deterministic domain check'});
    }else evidence.push({id:'target',label:'Target classification',status:'unknown',detail:'The input is treated as a project name or raw claim text.',source:'Poké input classifier'});
    const signals=[['seed phrase / private key request',/seed phrase|recovery phrase|private key/i],['unlimited token approval',/unlimited.*approv|approv.*unlimited/i],['guaranteed returns',/guaranteed.*(?:return|profit)|risk[- ]free profit/i],['urgency or time pressure',/urgent|within \d+ (?:minute|hour)|act now|limited time/i],['advance-fee request',/additional payment|unlock fee|withdrawal fee|pay.*release/i]] as const;
    for(const [label,pattern] of signals)if(pattern.test(description))evidence.push({id:`signal-${evidence.length}`,label:'User-described warning signal',status:'warning',detail:label,source:'User-provided description'});
    return { heuristicScore:null, riskLevel:'unknown', evidence, aiSynthesis:null };
  }
}

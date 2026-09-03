import { json } from '@sveltejs/kit';
import { AIGateway, stripModelReasoning } from '$server/ai/AIGateway';
import { ScamScoreService } from '$server/services/ScamScoreService';

type RiskAnalysis = {
  truthScore: number; riskLevel: string; confidence: string; scamType: string; summary: string;
  reasoningTrace: string[]; evidence: string[]; avoidance: string[]; protection: string[];
  missingInformation: string[]; disclaimer: string;
};
type Inference = { analysis: RiskAnalysis; model: string; requestId: string };

const cleanJson = (value: string) => {
  const cleaned=stripModelReasoning(value).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  const start=cleaned.indexOf('{'); const end=cleaned.lastIndexOf('}');
  return start>=0&&end>start?cleaned.slice(start,end+1):cleaned;
};
const parseAnalysis=(value:string):RiskAnalysis|null=>{try{const result=JSON.parse(cleanJson(value));return result&&typeof result==='object'?result as RiskAnalysis:null;}catch{return null;}};
const list=(value:unknown,fallback:string[])=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&item.trim().length>0).slice(0,8):fallback;
const normalize=(value:RiskAnalysis):RiskAnalysis=>{
  const risks=['low','medium','high','critical','unknown']; const confidences=['low','medium','high'];
  const risk=String(value.riskLevel||'unknown').toLowerCase(); const confidence=String(value.confidence||'low').toLowerCase();
  return { truthScore:Math.max(0,Math.min(100,Number(value.truthScore)||0)), riskLevel:risks.includes(risk)?risk:'unknown', confidence:confidences.includes(confidence)?confidence:'low', scamType:String(value.scamType||'unknown').slice(0,100), summary:String(value.summary||'The available information was insufficient for a clear assessment.').slice(0,1200), reasoningTrace:list(value.reasoningTrace,['Review the evidence and missing-information sections before acting.']), evidence:list(value.evidence,[]), avoidance:list(value.avoidance,['Verify the target through official channels before interacting.']), protection:list(value.protection,['Disconnect the site and review active wallet approvals.']), missingInformation:list(value.missingInformation,[]), disclaimer:String(value.disclaimer||'This is a risk assessment, not a factual accusation.').slice(0,500) };
};
const riskRank:Record<string,number>={unknown:-1,low:0,medium:1,high:2,critical:3};
const merge=(items:Inference[])=>{
  const analyses=items.map(item=>item.analysis); const primary=[...analyses].sort((a,b)=>riskRank[b.riskLevel]-riskRank[a.riskLevel])[0];
  return {...primary,truthScore:Math.round(analyses.reduce((sum,item)=>sum+item.truthScore,0)/analyses.length),evidence:[...new Set(analyses.flatMap(item=>item.evidence))].slice(0,8),reasoningTrace:[...new Set(analyses.flatMap(item=>item.reasoningTrace))].slice(0,8),missingInformation:[...new Set(analyses.flatMap(item=>item.missingInformation))].slice(0,8)};
};

export const POST=async({request})=>{try{
  const body=await request.json(); const target=String(body.target||'').trim().slice(0,500); const description=String(body.description||'').trim().slice(0,3000); const chainId=Number(body.chainId)||11155111;
  if(!target&&!description)return json({error:'Add a target or suspicious activity description.'},{status:400});
  const heuristics=await new ScamScoreService().score(target,chainId,description);
  const prompt=`You are Poké's evidence-first Web3 scam-risk analyst. Analyze only the supplied user input and heuristic evidence. Never state that a person or project is fraudulent as a fact unless conclusive sourced evidence exists. Missing data must remain unknown. truthScore is 0-100 and means confidence that the verdict is supported by supplied evidence, not the probability an accusation is true. reasoningTrace is a concise, user-facing sequence of verification steps, never hidden chain-of-thought. Return only JSON: {"truthScore":0,"riskLevel":"low|medium|high|critical|unknown","confidence":"low|medium|high","scamType":"classification","summary":"concise explanation","reasoningTrace":["evidence-based verification step"],"evidence":["sourced observation"],"avoidance":["general prevention"],"protection":["immediate action"],"missingInformation":["unverified data"],"disclaimer":"limitation"}. Give 3-6 concise reasoning, avoidance, and protection items. Target: ${target||'not supplied'}\nUser description: ${description||'not supplied'}\nHeuristic evidence: ${JSON.stringify(heuristics.evidence)}`;
  const gateway=new AIGateway(); const completions=await gateway.consensus([{role:'system',content:'Return strict JSON only. Never include private reasoning, analysis, think tags, or Markdown.'},{role:'user',content:prompt}]); const inferences:Inference[]=[];
  for(const original of completions){let completion=original;let parsed=parseAnalysis(completion.content);if(!parsed){completion=await gateway.complete([{role:'system',content:'Convert the supplied draft into strict JSON only.'},{role:'user',content:`Required keys: truthScore, riskLevel, confidence, scamType, summary, reasoningTrace, evidence, avoidance, protection, missingInformation, disclaimer.\nDraft:\n${completion.content.slice(0,9000)}`}],completion.model);parsed=parseAnalysis(completion.content);}if(parsed)inferences.push({analysis:normalize(parsed),model:completion.model,requestId:completion.requestId});}
  if(!inferences.length)throw new Error('The AI response could not be converted into a clear risk assessment. Please retry.');
  const ranks=inferences.map(item=>riskRank[item.analysis.riskLevel]); const spread=Math.max(...ranks)-Math.min(...ranks); const consensus=inferences.length===1?'single-model':spread===0?'agree':spread<=1?'partial':'disagree';
  return json({analysis:merge(inferences),heuristics:heuristics.evidence,scannedAt:new Date().toISOString(),consensus,inferences});
}catch(error){return json({error:error instanceof Error?error.message:'Scan failed'},{status:503});}};

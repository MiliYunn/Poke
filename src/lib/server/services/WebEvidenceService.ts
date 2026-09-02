export type RetrievedSource = { url: string; title: string; content: string; fetchedAt: string; status: 'retrieved'|'unavailable'; note?: string };

const privateHost = /^(localhost$|0\.0\.0\.0$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;
function cleanHtml(value:string){return value.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim();}
function validate(value:string){const url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw new Error('Only HTTP and HTTPS evidence links are allowed.');if(privateHost.test(url.hostname)||url.hostname.endsWith('.local'))throw new Error('Private network links are not allowed.');return url;}

export class WebEvidenceService {
  async retrieve(value:string):Promise<RetrievedSource>{
    let current=validate(value);
    try{
      for(let redirects=0;redirects<3;redirects++){
        const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8_000);
        const response=await fetch(current,{redirect:'manual',headers:{'user-agent':'Poke-Truth-Engine/1.0','accept':'text/html,text/plain,application/json'},signal:controller.signal}).finally(()=>clearTimeout(timer));
        if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)throw new Error('The source redirected without a destination.');current=validate(new URL(location,current).toString());continue;}
        if(!response.ok)throw new Error(`Source returned HTTP ${response.status}.`);
        const type=response.headers.get('content-type')||'';if(!/(text|html|json)/i.test(type))throw new Error('The source is not readable text.');
        const raw=(await response.text()).slice(0,80_000);const title=raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g,' ').trim()||current.hostname;
        const content=(type.includes('html')?cleanHtml(raw):raw.replace(/\s+/g,' ').trim()).slice(0,25_000);
        return{url:current.toString(),title,content,fetchedAt:new Date().toISOString(),status:'retrieved'};
      }
      throw new Error('Too many redirects.');
    }catch(error){return{url:current.toString(),title:current.hostname,content:'',fetchedAt:new Date().toISOString(),status:'unavailable',note:error instanceof Error?error.message:'Source retrieval failed.'};}
  }
}

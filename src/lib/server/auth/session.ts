import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

const encoder = new TextEncoder();
const secret = () => {
  const value = env.SESSION_SECRET || (dev ? 'poke-local-development-secret-change-me' : '');
  if (value.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  return value;
};
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const fromB64 = (value:string) => Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'==='.slice((value.length+3)%4)),c=>c.charCodeAt(0));
async function signature(payload:string){const key=await crypto.subtle.importKey('raw',encoder.encode(secret()),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(payload))));}
export async function seal(data:Record<string,unknown>){const payload=b64(encoder.encode(JSON.stringify(data)));return `${payload}.${await signature(payload)}`;}
export async function unseal<T>(token:string|undefined):Promise<T|null>{if(!token)return null;const [payload,sig]=token.split('.');if(!payload||!sig||await signature(payload)!==sig)return null;try{return JSON.parse(new TextDecoder().decode(fromB64(payload))) as T;}catch{return null;}}
export const cookieOptions = { path:'/', httpOnly:true, sameSite:'strict' as const, secure:!dev };

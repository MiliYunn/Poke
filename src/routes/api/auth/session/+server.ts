import { json } from '@sveltejs/kit'; import { cookieOptions, unseal } from '$server/auth/session';
type Session={wallet:string;expiresAt:number};
export const GET = async ({cookies}) => { const session=await unseal<Session>(cookies.get('poke_session')); if(!session||session.expiresAt<Date.now()){cookies.delete('poke_session',cookieOptions);return json({user:null});} return json({user:session}); };
export const DELETE = ({cookies}) => { cookies.delete('poke_session',cookieOptions); cookies.delete('poke_nonce',cookieOptions); return json({ok:true}); };

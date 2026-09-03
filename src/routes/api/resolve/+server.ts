import { json } from '@sveltejs/kit';
import { resolveHandle } from '$server/providers/HandleResolver';
export const GET=async({url})=>{try{const input=url.searchParams.get('input')||'';return json({input,address:await resolveHandle(input)});}catch(error){return json({error:error instanceof Error?error.message:'Handle resolution failed.'},{status:400});}};

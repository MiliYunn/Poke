import { redirect } from '@sveltejs/kit';
export const load = ({params}) => redirect(307, `/portfolio?address=${encodeURIComponent(params.identity)}`);

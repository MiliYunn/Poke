import { redirect } from '@sveltejs/kit';
export const load = ({params}) => redirect(307, `/explorer?chain=${encodeURIComponent(params.chain)}&query=${encodeURIComponent(params.query)}`);

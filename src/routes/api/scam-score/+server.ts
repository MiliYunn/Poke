import { json } from '@sveltejs/kit'; import { ScamScoreService } from '$server/services/ScamScoreService';
export const GET = async ({url}) => json(await new ScamScoreService().score(url.searchParams.get('target') || '',Number(url.searchParams.get('chainId'))||11155111));

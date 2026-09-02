import { json } from '@sveltejs/kit'; import { ScamScoreService } from '$server/services/ScamScoreService';
export const GET = ({url}) => json(new ScamScoreService().score(url.searchParams.get('target') || ''));

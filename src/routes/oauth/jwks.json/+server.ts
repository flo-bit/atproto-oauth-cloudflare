import { json } from '@sveltejs/kit';
import { createOAuthClient } from '$lib/server/oauth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
	const oauth = createOAuthClient(platform?.env);
	return json(oauth.jwks ?? { keys: [] });
};

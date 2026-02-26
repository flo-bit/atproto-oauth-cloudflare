import { json } from '@sveltejs/kit';
import { createOAuthClient } from '$lib/server/oauth';
import type { RequestHandler } from './$types';
import type { Did } from '@atcute/lexicons';

export const POST: RequestHandler = async ({ cookies, platform }) => {
	const did = cookies.get('did') as Did | undefined;

	if (did) {
		try {
			const oauth = createOAuthClient(platform?.env);
			await oauth.revoke(did);
		} catch (e) {
			console.error('Error revoking session:', e);
		}
	}

	cookies.delete('did', { path: '/' });

	return json({ ok: true });
};

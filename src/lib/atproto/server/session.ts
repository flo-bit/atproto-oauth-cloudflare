import type { Cookies } from '@sveltejs/kit';
import { Client } from '@atcute/client';
import type { Did } from '@atcute/lexicons';
import type { OAuthSession } from '@atcute/oauth-node-client';
import { createOAuthClient } from './oauth';
import { getSignedCookie } from './signed-cookie';

export type SessionLocals = {
	session: OAuthSession | null;
	client: Client | null;
	did: Did | null;
};

/**
 * Restores an OAuth session from the signed `did` cookie.
 * Returns session locals to be assigned to `event.locals`.
 * Deletes the cookie if the session can't be restored.
 */
export async function restoreSession(
	cookies: Cookies,
	env?: App.Platform['env']
): Promise<SessionLocals> {
	const did = getSignedCookie(cookies, 'did') as Did | null;

	if (!did) {
		return { session: null, client: null, did: null };
	}

	try {
		const oauth = createOAuthClient(env);
		const session = await oauth.restore(did);

		return {
			session,
			client: new Client({ handler: session }),
			did
		};
	} catch (e) {
		console.error('Failed to restore session:', e);
		cookies.delete('did', { path: '/' });
		return { session: null, client: null, did: null };
	}
}

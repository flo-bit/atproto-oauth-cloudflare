import type { Handle } from '@sveltejs/kit';
import { createOAuthClient } from '$lib/server/oauth';
import { Client } from '@atcute/client';
import type { Did } from '@atcute/lexicons';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.session = null;
	event.locals.client = null;
	event.locals.did = undefined;

	const did = event.cookies.get('did') as Did | undefined;

	if (did) {
		try {
			const oauth = createOAuthClient(event.platform?.env);
			const session = await oauth.restore(did);

			event.locals.session = session;
			event.locals.client = new Client({ handler: session });
			event.locals.did = did;
		} catch (e) {
			console.error('Failed to restore session:', e);
			event.cookies.delete('did', { path: '/' });
		}
	}

	return resolve(event);
};

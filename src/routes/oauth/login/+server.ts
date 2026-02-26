import { json } from '@sveltejs/kit';
import { createOAuthClient } from '$lib/server/oauth';
import type { RequestHandler } from './$types';
import type { ActorIdentifier } from '@atcute/lexicons';
import { scope } from '$lib/atproto/metadata';
import { signUpPDS } from '$lib/atproto/settings';

export const POST: RequestHandler = async ({ request, platform }) => {
	const oauth = createOAuthClient(platform?.env);
	const body = await request.json();
	const { handle, signup } = body as { handle?: string; signup?: boolean };

	const target = signup
		? ({ type: 'pds', serviceUrl: signUpPDS } as const)
		: ({ type: 'account', identifier: handle as ActorIdentifier } as const);

	const { url } = await oauth.authorize({
		target,
		scope,
		prompt: signup ? 'create' : undefined
	});

	return json({ url: url.toString() });
};

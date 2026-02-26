import { redirect } from '@sveltejs/kit';
import { createOAuthClient } from '$lib/server/oauth';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, platform, cookies }) => {
	const oauth = createOAuthClient(platform?.env);

	const { session } = await oauth.callback(url.searchParams);

	cookies.set('did', session.did, {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 180 // 180 days
	});

	redirect(303, '/');
};

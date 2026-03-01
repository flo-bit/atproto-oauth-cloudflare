import { redirect } from '@sveltejs/kit';
import { createOAuthClient } from '$lib/atproto/server/oauth';
import { setSignedCookie } from '$lib/atproto/server/signed-cookie';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, platform, cookies }) => {
	const oauth = createOAuthClient(platform?.env);

	// oauth.callback() validates the state parameter (CSRF protection) and
	// exchanges the authorization code for tokens via the token endpoint.
	try {
		const { session } = await oauth.callback(url.searchParams);

		setSignedCookie(cookies, 'did', session.did, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 180 // 180 days
		});
	} catch (e) {
		console.error('OAuth callback failed:', e);
		redirect(303, '/?error=auth_failed');
	}

	redirect(303, '/');
};

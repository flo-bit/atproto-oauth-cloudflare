import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.client || !locals.did) throw error(401, 'Not authenticated');

	const blob = await request.blob();

	const response = await locals.client.post('com.atproto.repo.uploadBlob', {
		params: { repo: locals.did },
		input: blob
	});

	if (!response?.ok) throw error(500, 'Upload failed');

	return json(response.data.blob);
};

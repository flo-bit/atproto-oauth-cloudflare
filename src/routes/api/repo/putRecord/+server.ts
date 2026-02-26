import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.client || !locals.did) throw error(401, 'Not authenticated');

	const { collection, rkey, record } = (await request.json()) as {
		collection: `${string}.${string}.${string}`;
		rkey?: string;
		record: Record<string, unknown>;
	};

	const response = await locals.client.post('com.atproto.repo.putRecord', {
		input: {
			collection,
			repo: locals.did,
			rkey: rkey || 'self',
			record
		}
	});

	return json(response.data);
};

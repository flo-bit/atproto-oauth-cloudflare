import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.client || !locals.did)
		return {
			statuses: [] as { rkey: string; status: string; createdAt: string }[],
			blobs: [] as { rkey: string; blob: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number }; createdAt: string }[]
		};

	try {
		const [statusResponse, blobResponse] = await Promise.all([
			locals.client.get('com.atproto.repo.listRecords', {
				params: {
					repo: locals.did,
					collection: 'xyz.statusphere.status',
					limit: 10
				}
			}),
			locals.client
				.get('com.atproto.repo.listRecords', {
					params: {
						repo: locals.did,
						collection: 'social.atmo.test.blob',
						limit: 20
					}
				})
				.catch(() => null)
		]);

		const statuses = statusResponse.ok
			? statusResponse.data.records.map((r) => ({
					rkey: r.uri.split('/').pop()!,
					status: (r.value as { status: string }).status,
					createdAt: (r.value as { createdAt: string }).createdAt
				}))
			: [];

		const blobs = blobResponse?.ok
			? blobResponse.data.records.map((r) => {
					const value = r.value as {
						blob: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number };
						createdAt: string;
					};
					return {
						rkey: r.uri.split('/').pop()!,
						blob: value.blob,
						createdAt: value.createdAt
					};
				})
			: [];

		return { statuses, blobs };
	} catch {
		return { statuses: [], blobs: [] };
	}
};

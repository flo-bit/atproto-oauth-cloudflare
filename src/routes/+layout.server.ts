import type { LayoutServerLoad } from './$types';
import { getDetailedProfile, describeRepo } from '$lib/atproto/methods';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.did || !locals.client) {
		return { did: undefined, profile: undefined };
	}

	let profile;
	try {
		profile = await getDetailedProfile({ did: locals.did });

		if (!profile || profile.handle === 'handle.invalid') {
			const repo = await describeRepo({ did: locals.did });
			profile = {
				did: locals.did,
				handle: repo?.handle || 'handle.invalid'
			};
		}
	} catch (e) {
		console.error('Failed to load profile:', e);
	}

	return {
		did: locals.did,
		profile
	};
};

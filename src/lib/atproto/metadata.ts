import { permissions, REDIRECT_PATH, SITE } from './settings';

function constructScope() {
	const repos = permissions.collections.map((collection) => 'repo:' + collection).join(' ');

	let rpcs = '';
	for (const [key, value] of Object.entries(permissions.rpc ?? {})) {
		if (Array.isArray(value)) {
			rpcs += value.map((lxm) => 'rpc?lxm=' + lxm + '&aud=' + key).join(' ');
		} else {
			rpcs += 'rpc?lxm=' + value + '&aud=' + key;
		}
	}

	let blobScope: string | undefined = undefined;
	if (Array.isArray(permissions.blobs) && permissions.blobs.length > 0) {
		blobScope = 'blob?' + permissions.blobs.map((b) => 'accept=' + b).join('&');
	} else if (permissions.blobs && permissions.blobs.length > 0) {
		blobScope = 'blob:' + permissions.blobs;
	}

	const scope = ['atproto', repos, rpcs, blobScope].filter((v) => v?.trim()).join(' ');
	return scope;
}

export const scope = constructScope();

export function constructMetadata() {
	return {
		client_id: SITE + '/oauth-client-metadata.json',
		redirect_uris: [SITE + REDIRECT_PATH] as [string],
		scope,
		jwks_uri: SITE + '/oauth/jwks.json'
	};
}

export const metadata = constructMetadata();

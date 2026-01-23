import { resolve } from '$app/paths';
import { blobs, collections, rpcCalls } from './settings';

function constructScope() {
	const repos = collections.map((collection) => 'repo:' + collection).join(' ');

	let rpcs = '';
	for (const [key, value] of Object.entries(rpcCalls)) {
		if (Array.isArray(value)) {
			rpcs += value.map((lxm) => 'rpc?lxm=' + lxm + '&aud=' + key).join(' ');
		} else {
			rpcs += 'rpc?lxm=' + value + '&aud=' + key;
		}
	}
	let blobScope: string | undefined = undefined;
	if (Array.isArray(blobs)) {
		blobScope = 'blob?' + blobs.map((b) => 'accept=' + b).join('&');
	} else if (blobs) {
		blobScope = 'blob:' + blobs;
	}

	const scope = ['atproto', repos, rpcs, blobScope].filter((v) => v?.trim()).join(' ');
	console.log(scope);
	return scope;
}

export const metadata = {
	client_id: resolve('/oauth-client-metadata.json'),
	redirect_uris: [resolve('/')],
	scope: constructScope(),
	grant_types: ['authorization_code', 'refresh_token'],
	response_types: ['code'],
	token_endpoint_auth_method: 'none',
	application_type: 'web',
	dpop_bound_access_tokens: true
};

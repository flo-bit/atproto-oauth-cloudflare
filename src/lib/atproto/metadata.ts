import { permissions } from './settings';

function constructScope() {
	const parts: string[] = ['atproto'];

	for (const collection of permissions.collections) {
		parts.push('repo:' + collection);
	}

	for (const [key, value] of Object.entries(permissions.rpc ?? {})) {
		const lxms = Array.isArray(value) ? value : [value];
		for (const lxm of lxms) {
			parts.push('rpc?lxm=' + lxm + '&aud=' + key);
		}
	}

	if (permissions.blobs.length > 0) {
		parts.push('blob?' + permissions.blobs.map((b) => 'accept=' + b).join('&'));
	}

	return parts.join(' ');
}

export const scope = constructScope();

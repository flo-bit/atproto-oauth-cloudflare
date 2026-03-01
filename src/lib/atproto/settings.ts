import { dev } from '$app/environment';

type Permissions = {
	collections: readonly string[];
	rpc: Record<string, string | string[]>;
	blobs: readonly string[];
};

export const permissions = {
	// collections you can create/delete/update
	collections: ['xyz.statusphere.status'],

	// what types of authenticated proxied requests you can make to services
	rpc: {},

	// what types of blobs you can upload to a users PDS
	blobs: []
} as const satisfies Permissions;

// Extract base collection name (before any query params)
type ExtractCollectionBase<T extends string> = T extends `${infer Base}?${string}` ? Base : T;

export type AllowedCollection = ExtractCollectionBase<(typeof permissions.collections)[number]>;

// which PDS to use for signup (change to your preferred PDS)
const devPDS = 'https://pds.rip/';
const prodPDS = 'https://selfhosted.social/';
export const signUpPDS = dev ? devPDS : prodPDS;

// where to redirect after oauth login/signup
export const REDIRECT_PATH = '/oauth/callback';

export const DOH_RESOLVER = 'https://mozilla.cloudflare-dns.com/dns-query';

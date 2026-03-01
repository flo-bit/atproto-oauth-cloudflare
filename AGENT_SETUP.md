# Add AT Protocol OAuth to SvelteKit + Cloudflare Workers

You are adding AT Protocol OAuth authentication to an existing SvelteKit project deployed on Cloudflare Workers. This uses server-side OAuth with `@atcute/oauth-node-client`, Cloudflare KV for session storage, and SvelteKit remote functions.

## Prerequisites

The project must already use:
- SvelteKit with `@sveltejs/adapter-cloudflare`
- A `wrangler.jsonc` (or `wrangler.toml`) config

## Step 0: Ask the user

Before making any changes, ask the user these questions:

1. **UI**: Should I add a login UI?
   - **`foxui`** — Use `@foxui/social` login modal (polished, recommended)
   - **`basic`** — Simple login/logout page at `/user` route (uses Tailwind if available)
   - **`none`** — Backend only, no UI (you'll build your own)

2. **Collections**: What AT Protocol collections should your app write to? (e.g. `xyz.statusphere.status`, `app.bsky.feed.like`). Leave empty for read-only.

3. **Blobs**: Does the app need to upload blobs (images, video)? If yes, what types? (e.g. `image/*`, `video/*`)

Use the answers to customize `settings.ts` (marked with `CUSTOMIZE` below) and choose which UI dependencies/files to create.

## Step 1: Install dependencies

Always install:

```sh
pnpm add valibot
pnpm add -D @atcute/oauth-node-client @atcute/identity-resolver @atcute/lexicons @atcute/client @atcute/tid @cloudflare/workers-types tsx @atcute/atproto @atcute/bluesky
```

If UI choice is `foxui`:

```sh
pnpm add @foxui/social @foxui/core
```

## Step 2: Create files

Create all of the following files. These go into `src/lib/atproto/` and `src/routes/(oauth)/`.

### `src/lib/atproto/settings.ts`

Fill in `collections` and `blobs` from the user's answers. If no collections were specified, use an empty array.

```ts
import { dev } from '$app/environment';

type Permissions = {
	collections: readonly string[];
	rpc: Record<string, string | string[]>;
	blobs: readonly string[];
};

export const permissions = {
	// CUSTOMIZE: add the user's collections
	collections: [],

	// CUSTOMIZE: add any authenticated RPC requests needed
	rpc: {},

	// CUSTOMIZE: add blob types if the user needs uploads (e.g. ['image/*'])
	blobs: []
} as const satisfies Permissions;

type ExtractCollectionBase<T extends string> = T extends `${infer Base}?${string}` ? Base : T;

export type AllowedCollection = ExtractCollectionBase<(typeof permissions.collections)[number]>;

// PDS to use for signup (change to preferred PDS)
const devPDS = 'https://bsky.social/';
const prodPDS = 'https://bsky.social/';
export const signUpPDS = dev ? devPDS : prodPDS;

export const REDIRECT_PATH = '/oauth/callback';

export const DOH_RESOLVER = 'https://mozilla.cloudflare-dns.com/dns-query';
```

### `src/lib/atproto/metadata.ts`

```ts
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
```

### `src/lib/atproto/auth.svelte.ts`

```ts
import { AppBskyActorDefs } from '@atcute/bluesky';
import type { ActorIdentifier, Did } from '@atcute/lexicons';
import { page } from '$app/state';

export const user = {
	get profile() {
		return (page.data?.profile as AppBskyActorDefs.ProfileViewDetailed | null) ?? null;
	},
	get isLoggedIn() {
		return !!page.data?.did;
	},
	get did() {
		return (page.data?.did as Did | null) ?? null;
	}
};

export async function login(handle: string) {
	if (handle.startsWith('did:')) {
		if (handle.length < 6) throw new Error('DID must be at least 6 characters');
	} else if (handle.includes('.') && handle.length > 3) {
		handle = (handle.startsWith('@') ? handle.slice(1) : handle) as ActorIdentifier;
		if (handle.length < 4) throw new Error('Handle must be at least 4 characters');
	} else if (handle.length > 3) {
		handle = ((handle.startsWith('@') ? handle.slice(1) : handle) +
			'.bsky.social') as ActorIdentifier;
	} else {
		throw new Error('Please provide a valid handle or DID.');
	}

	const { oauthLogin } = await import('./server/oauth.remote');
	const { url } = await oauthLogin({ handle });
	window.location.assign(url);

	await new Promise((_resolve, reject) => {
		window.addEventListener('pageshow', () => reject(new Error('user aborted the login request')), {
			once: true
		});
	});
}

export async function signup() {
	const { oauthLogin } = await import('./server/oauth.remote');
	const { url } = await oauthLogin({ signup: true });
	window.location.assign(url);

	await new Promise((_resolve, reject) => {
		window.addEventListener('pageshow', () => reject(new Error('user aborted the signup request')), {
			once: true
		});
	});
}

export async function logout() {
	try {
		const { oauthLogout } = await import('./server/oauth.remote');
		await oauthLogout();
	} catch (e) {
		console.error('Error logging out:', e);
	}

	window.location.href = '/';
}
```

### `src/lib/atproto/methods.ts`

```ts
import { parseResourceUri, type Did, type Handle } from '@atcute/lexicons';
import { user } from './auth.svelte';
import { DOH_RESOLVER, type AllowedCollection } from './settings';
import {
	CompositeDidDocumentResolver,
	CompositeHandleResolver,
	DohJsonHandleResolver,
	PlcDidDocumentResolver,
	WebDidDocumentResolver,
	WellKnownHandleResolver
} from '@atcute/identity-resolver';
import { Client, simpleFetchHandler } from '@atcute/client';
import { type AppBskyActorDefs } from '@atcute/bluesky';

export type Collection = `${string}.${string}.${string}`;
import * as TID from '@atcute/tid';

export function parseUri(uri: string) {
	const parts = parseResourceUri(uri);
	if (!parts.ok) return;
	return parts.value;
}

export async function resolveHandle({ handle }: { handle: Handle }) {
	const handleResolver = new CompositeHandleResolver({
		methods: {
			dns: new DohJsonHandleResolver({ dohUrl: DOH_RESOLVER }),
			http: new WellKnownHandleResolver()
		}
	});

	const data = await handleResolver.resolve(handle);
	return data;
}

const didResolver = new CompositeDidDocumentResolver({
	methods: {
		plc: new PlcDidDocumentResolver(),
		web: new WebDidDocumentResolver()
	}
});

export async function getPDS(did: Did) {
	const doc = await didResolver.resolve(did as Did<'plc'> | Did<'web'>);
	if (!doc.service) throw new Error('No PDS found');
	for (const service of doc.service) {
		if (service.id === '#atproto_pds') {
			return service.serviceEndpoint.toString();
		}
	}
}

export async function getDetailedProfile(data?: { did?: Did; client?: Client }) {
	data ??= {};
	data.did ??= user.did ?? undefined;

	if (!data.did) throw new Error('Error getting detailed profile: no did');

	data.client ??= new Client({
		handler: simpleFetchHandler({ service: 'https://public.api.bsky.app' })
	});

	const response = await data.client.get('app.bsky.actor.getProfile', {
		params: { actor: data.did }
	});

	if (!response.ok) return;

	return response.data;
}

export async function getClient({ did }: { did: Did }) {
	const pds = await getPDS(did);
	if (!pds) throw new Error('PDS not found');

	const client = new Client({
		handler: simpleFetchHandler({ service: pds })
	});

	return client;
}

export async function listRecords({
	did,
	collection,
	cursor,
	limit = 100,
	client
}: {
	did?: Did;
	collection: `${string}.${string}.${string}`;
	cursor?: string;
	limit?: number;
	client?: Client;
}) {
	did ??= user.did ?? undefined;
	if (!collection) {
		throw new Error('Missing parameters for listRecords');
	}
	if (!did) {
		throw new Error('Missing did for listRecords');
	}

	client ??= await getClient({ did });

	const allRecords = [];

	let currentCursor = cursor;
	do {
		const response = await client.get('com.atproto.repo.listRecords', {
			params: {
				repo: did,
				collection,
				limit: !limit || limit > 100 ? 100 : limit,
				cursor: currentCursor
			}
		});

		if (!response.ok) {
			return allRecords;
		}

		allRecords.push(...response.data.records);
		currentCursor = response.data.cursor;
	} while (currentCursor && (!limit || allRecords.length < limit));

	return allRecords;
}

export async function getRecord({
	did,
	collection,
	rkey = 'self',
	client
}: {
	did?: Did;
	collection: Collection;
	rkey?: string;
	client?: Client;
}) {
	did ??= user.did ?? undefined;

	if (!collection) {
		throw new Error('Missing parameters for getRecord');
	}
	if (!did) {
		throw new Error('Missing did for getRecord');
	}

	client ??= await getClient({ did });

	const record = await client.get('com.atproto.repo.getRecord', {
		params: {
			repo: did,
			collection,
			rkey
		}
	});

	return JSON.parse(JSON.stringify(record.data));
}

export async function putRecord({
	collection,
	rkey = 'self',
	record
}: {
	collection: AllowedCollection;
	rkey?: string;
	record: Record<string, unknown>;
}) {
	if (!user.did) throw new Error('Not logged in');

	const { putRecord: putRecordRemote } = await import('./server/repo.remote');
	const data = await putRecordRemote({ collection, rkey, record });
	return { ok: true, data };
}

export async function deleteRecord({
	collection,
	rkey = 'self'
}: {
	collection: AllowedCollection;
	rkey: string;
}) {
	if (!user.did) throw new Error('Not logged in');

	const { deleteRecord: deleteRecordRemote } = await import('./server/repo.remote');
	const data = await deleteRecordRemote({ collection, rkey });
	return data.ok;
}

export async function uploadBlob({ blob }: { blob: Blob }) {
	if (!user.did) throw new Error("Can't upload blob: Not logged in");

	const { uploadBlob: uploadBlobRemote } = await import('./server/repo.remote');
	return await uploadBlobRemote({ blob });
}

export async function describeRepo({ client, did }: { client?: Client; did?: Did }) {
	did ??= user.did ?? undefined;
	if (!did) {
		throw new Error('Error describeRepo: No did');
	}
	client ??= await getClient({ did });

	const repo = await client.get('com.atproto.repo.describeRepo', {
		params: {
			repo: did
		}
	});
	if (!repo.ok) return;

	return repo.data;
}

export async function getBlobURL({
	did,
	blob
}: {
	did: Did;
	blob: {
		$type: 'blob';
		ref: {
			$link: string;
		};
	};
}) {
	const pds = await getPDS(did);
	return `${pds}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${blob.ref.$link}`;
}

export function getCDNImageBlobUrl({
	did,
	blob
}: {
	did?: string;
	blob: {
		$type: 'blob';
		ref: {
			$link: string;
		};
	};
}) {
	did ??= user.did ?? undefined;

	return `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${blob.ref.$link}@webp`;
}

export async function searchActorsTypeahead(
	q: string,
	limit: number = 10,
	host?: string
): Promise<{ actors: AppBskyActorDefs.ProfileViewBasic[]; q: string }> {
	host ??= 'https://public.api.bsky.app';

	const client = new Client({
		handler: simpleFetchHandler({ service: host })
	});

	const response = await client.get('app.bsky.actor.searchActorsTypeahead', {
		params: {
			q,
			limit
		}
	});

	if (!response.ok) return { actors: [], q };

	return { actors: response.data.actors, q };
}

export function createTID() {
	return TID.now();
}
```

### `src/lib/atproto/index.ts`

```ts
export { user, login, signup, logout } from './auth.svelte';

export {
	parseUri,
	resolveHandle,
	getPDS,
	getDetailedProfile,
	getClient,
	listRecords,
	getRecord,
	putRecord,
	deleteRecord,
	uploadBlob,
	describeRepo,
	getBlobURL,
	getCDNImageBlobUrl,
	searchActorsTypeahead,
	createTID
} from './methods';
```

### `src/lib/atproto/server/signed-cookie.ts`

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

import type { Cookies } from '@sveltejs/kit';

import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

const SEPARATOR = '.';

function getSecret(): string {
	const secret = env.COOKIE_SECRET;
	if (secret) return secret;
	if (dev) return 'dev-cookie-secret-not-for-production';
	throw new Error('COOKIE_SECRET is not set');
}

function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
	const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
	const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function hmacSha256(data: string): Uint8Array {
	return createHmac('sha256', getSecret()).update(data).digest();
}

export function getSignedCookie(cookies: Cookies, name: string): string | null {
	const signed = cookies.get(name);
	if (!signed) return null;

	const idx = signed.lastIndexOf(SEPARATOR);
	if (idx === -1) return null;

	const value = signed.slice(0, idx);
	const sig = signed.slice(idx + 1);

	let expected: Uint8Array;
	let got: Uint8Array;
	try {
		expected = hmacSha256(value);
		got = fromBase64Url(sig);
	} catch {
		return null;
	}

	if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;

	return value;
}

export function setSignedCookie(
	cookies: Cookies,
	name: string,
	value: string,
	options: Parameters<Cookies['set']>[2]
): void {
	const sig = toBase64Url(hmacSha256(value));
	const signed = `${value}${SEPARATOR}${sig}`;
	cookies.set(name, signed, options);
}
```

### `src/lib/atproto/server/kv-store.ts`

```ts
import type { Store } from '@atcute/oauth-node-client';

export class KVStore<K extends string, V> implements Store<K, V> {
	private kv: KVNamespace;
	private expirationTtl?: number;

	constructor(kv: KVNamespace, options?: { expirationTtl?: number }) {
		this.kv = kv;
		this.expirationTtl = options?.expirationTtl;
	}

	async get(key: K): Promise<V | undefined> {
		const value = await this.kv.get(key, 'text');
		if (value === null) return undefined;
		return JSON.parse(value) as V;
	}

	async set(key: K, value: V): Promise<void> {
		await this.kv.put(key, JSON.stringify(value), {
			expirationTtl: this.expirationTtl
		});
	}

	async delete(key: K): Promise<void> {
		await this.kv.delete(key);
	}

	async clear(): Promise<void> {
		let cursor: string | undefined;
		do {
			const result = await this.kv.list({ cursor });
			for (const key of result.keys) {
				await this.kv.delete(key.name);
			}
			cursor = result.list_complete ? undefined : result.cursor;
		} while (cursor);
	}
}
```

### `src/lib/atproto/server/oauth.ts`

```ts
import {
	OAuthClient,
	MemoryStore,
	type ClientAssertionPrivateJwk,
	type OAuthClientStores,
	type OAuthSession,
	type StoredSession,
	type StoredState
} from '@atcute/oauth-node-client';
import type { Did } from '@atcute/lexicons';
import {
	CompositeDidDocumentResolver,
	CompositeHandleResolver,
	DohJsonHandleResolver,
	LocalActorResolver,
	PlcDidDocumentResolver,
	WebDidDocumentResolver,
	WellKnownHandleResolver
} from '@atcute/identity-resolver';
import { KVStore } from './kv-store';
import { DOH_RESOLVER, REDIRECT_PATH } from '../settings';
import { scope } from '../metadata';
import { dev } from '$app/environment';

function createActorResolver() {
	return new LocalActorResolver({
		handleResolver: new CompositeHandleResolver({
			methods: {
				dns: new DohJsonHandleResolver({ dohUrl: DOH_RESOLVER }),
				http: new WellKnownHandleResolver()
			}
		}),
		didDocumentResolver: new CompositeDidDocumentResolver({
			methods: {
				plc: new PlcDidDocumentResolver(),
				web: new WebDidDocumentResolver()
			}
		})
	});
}

function createStores(env?: App.Platform['env']): OAuthClientStores {
	if (env?.OAUTH_SESSIONS && env?.OAUTH_STATES) {
		return {
			sessions: new KVStore<Did, StoredSession>(env.OAUTH_SESSIONS),
			states: new KVStore<string, StoredState>(env.OAUTH_STATES, { expirationTtl: 600 })
		};
	}
	return {
		sessions: new MemoryStore<Did, StoredSession>(),
		states: new MemoryStore<string, StoredState>({ ttl: 600_000 })
	};
}

export function createOAuthClient(env?: App.Platform['env']): OAuthClient {
	const actorResolver = createActorResolver();
	const stores = createStores(env);

	if (dev && !env?.OAUTH_PUBLIC_URL) {
		return new OAuthClient({
			metadata: {
				redirect_uris: [`http://127.0.0.1:5183${REDIRECT_PATH}`],
				scope
			},
			actorResolver,
			stores
		});
	}

	if (!env?.OAUTH_PUBLIC_URL) {
		throw new Error('OAUTH_PUBLIC_URL is not set');
	}
	if (!env.CLIENT_ASSERTION_KEY) {
		throw new Error('CLIENT_ASSERTION_KEY secret is not set. Run: pnpm env:generate-key');
	}
	const site = env.OAUTH_PUBLIC_URL;
	const key: ClientAssertionPrivateJwk = JSON.parse(env.CLIENT_ASSERTION_KEY);

	return new OAuthClient({
		metadata: {
			client_id: site + '/oauth-client-metadata.json',
			redirect_uris: [site + REDIRECT_PATH],
			scope,
			jwks_uri: site + '/oauth/jwks.json'
		},
		keyset: [key],
		actorResolver,
		stores
	});
}

export type { OAuthSession };
```

### `src/lib/atproto/server/oauth.remote.ts`

```ts
import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';
import { createOAuthClient } from './oauth';
import { getSignedCookie } from './signed-cookie';
import { scope } from '../metadata';
import { signUpPDS } from '../settings';
import type { ActorIdentifier, Did } from '@atcute/lexicons';

export const oauthLogin = command(
	v.object({
		handle: v.optional(v.pipe(v.string(), v.minLength(3))),
		signup: v.optional(v.boolean())
	}),
	async (input) => {
		const { platform } = getRequestEvent();

		try {
			const oauth = createOAuthClient(platform?.env);

			const target = input.signup
				? ({ type: 'pds', serviceUrl: signUpPDS } as const)
				: ({ type: 'account', identifier: input.handle as ActorIdentifier } as const);

			const { url } = await oauth.authorize({
				target,
				scope,
				prompt: input.signup ? 'create' : undefined
			});

			return { url: url.toString() };
		} catch (e) {
			if (e && typeof e === 'object' && 'status' in e) throw e;
			const message = e instanceof Error ? e.message : 'Login failed';
			error(400, message);
		}
	}
);

export const oauthLogout = command(async () => {
	const { cookies, platform } = getRequestEvent();
	const did = getSignedCookie(cookies, 'did') as Did | null;

	if (did) {
		try {
			const oauth = createOAuthClient(platform?.env);
			await oauth.revoke(did);
		} catch (e) {
			console.error('Error revoking session:', e);
		}
	}

	cookies.delete('did', { path: '/' });

	return { ok: true };
});
```

### `src/lib/atproto/server/repo.remote.ts`

```ts
import { error } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { permissions } from '../settings';

const collectionSchema = v.pipe(
	v.string(),
	v.regex(/^[a-zA-Z][a-zA-Z0-9-]*\.[a-zA-Z][a-zA-Z0-9-]*\.[a-zA-Z][a-zA-Z0-9-]*$/),
	v.check(
		(c) => permissions.collections.some((allowed) => c === allowed || allowed.startsWith(c + '?')),
		'Collection not in allowed list'
	)
);

const rkeySchema = v.optional(v.pipe(v.string(), v.regex(/^[a-zA-Z0-9._:~-]{1,512}$/)));

export const putRecord = command(
	v.object({
		collection: collectionSchema,
		rkey: rkeySchema,
		record: v.record(v.string(), v.unknown())
	}),
	async (input) => {
		const { locals } = getRequestEvent();
		if (!locals.client || !locals.did) error(401, 'Not authenticated');

		const response = await locals.client.post('com.atproto.repo.putRecord', {
			input: {
				collection: input.collection as `${string}.${string}.${string}`,
				repo: locals.did,
				rkey: input.rkey || 'self',
				record: input.record
			}
		});

		return response.data;
	}
);

export const deleteRecord = command(
	v.object({
		collection: collectionSchema,
		rkey: rkeySchema
	}),
	async (input) => {
		const { locals } = getRequestEvent();
		if (!locals.client || !locals.did) error(401, 'Not authenticated');

		const response = await locals.client.post('com.atproto.repo.deleteRecord', {
			input: {
				collection: input.collection as `${string}.${string}.${string}`,
				repo: locals.did,
				rkey: input.rkey || 'self'
			}
		});

		return { ok: response.ok };
	}
);

export const uploadBlob = command(
	v.object({
		blob: v.instance(Blob)
	}),
	async (input) => {
		const { locals } = getRequestEvent();
		if (!locals.client || !locals.did) error(401, 'Not authenticated');

		const response = await locals.client.post('com.atproto.repo.uploadBlob', {
			params: { repo: locals.did },
			input: input.blob
		});

		if (!response.ok) error(500, 'Upload failed');

		return response.data.blob as {
			$type: 'blob';
			ref: { $link: string };
			mimeType: string;
			size: number;
		};
	}
);
```

### `src/lib/atproto/server/session.ts`

```ts
import type { Cookies } from '@sveltejs/kit';
import { Client } from '@atcute/client';
import type { Did } from '@atcute/lexicons';
import type { OAuthSession } from '@atcute/oauth-node-client';
import { createOAuthClient } from './oauth';
import { getSignedCookie } from './signed-cookie';

export type SessionLocals = {
	session: OAuthSession | null;
	client: Client | null;
	did: Did | null;
};

export async function restoreSession(
	cookies: Cookies,
	env?: App.Platform['env']
): Promise<SessionLocals> {
	const did = getSignedCookie(cookies, 'did') as Did | null;

	if (!did) {
		return { session: null, client: null, did: null };
	}

	try {
		const oauth = createOAuthClient(env);
		const session = await oauth.restore(did);

		return {
			session,
			client: new Client({ handler: session }),
			did
		};
	} catch (e) {
		console.error('Failed to restore session:', e);
		cookies.delete('did', { path: '/' });
		return { session: null, client: null, did: null };
	}
}
```

### `src/lib/atproto/server/profile.ts`

```ts
import type { Did } from '@atcute/lexicons';
import { getDetailedProfile, describeRepo } from '../methods';

const PROFILE_CACHE_TTL = 60 * 60; // 1 hour

export async function loadProfile(did: Did, profileCache?: KVNamespace) {
	if (profileCache) {
		try {
			const cached = await profileCache.get(did, 'json');
			if (cached) return cached as Record<string, unknown>;
		} catch {
			// Cache read failed, continue to fresh fetch
		}
	}

	const profile = await fetchProfile(did);

	if (profileCache && profile) {
		profileCache
			.put(did, JSON.stringify(profile), { expirationTtl: PROFILE_CACHE_TTL })
			.catch(() => {});
	}

	return profile;
}

async function fetchProfile(did: Did) {
	try {
		let profile = await getDetailedProfile({ did });

		if (!profile || profile.handle === 'handle.invalid') {
			const repo = await describeRepo({ did });
			profile = {
				did,
				handle: repo?.handle || 'handle.invalid'
			} as typeof profile;
		}

		return profile;
	} catch (e) {
		console.error('Failed to load profile:', e);
		return undefined;
	}
}
```

### `src/lib/atproto/scripts/generate-key.ts`

```ts
import { generateClientAssertionKey } from '@atcute/oauth-node-client';

const key = await generateClientAssertionKey('main-key');
console.log(JSON.stringify(key));
```

### `src/lib/atproto/scripts/generate-secret.ts`

```ts
import { randomBytes } from 'node:crypto';

console.log(randomBytes(32).toString('base64url'));
```

### `src/lib/atproto/scripts/setup-dev.ts`

```ts
import { existsSync } from 'node:fs';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

import { generateClientAssertionKey } from '@atcute/oauth-node-client';

const cwd = process.cwd();
const examplePath = resolve(cwd, '.env.example');
const envPath = resolve(cwd, '.env');

if (!existsSync(envPath)) {
	if (!existsSync(examplePath)) {
		throw new Error(`missing .env.example (expected at ${examplePath})`);
	}
	await copyFile(examplePath, envPath);
	console.log(`created ${envPath}`);
}

const upsertVar = (input: string, key: string, value: string): string => {
	const line = `${key}=${value}`;
	const re = new RegExp(`^${key}=.*$`, 'm');

	if (re.test(input)) {
		const match = input.match(re);
		const current = match ? match[0].slice(key.length + 1).trim() : '';
		if (current === '' || current === "''" || current === '""' || current.includes('...')) {
			return input.replace(re, line);
		}
		return input;
	}

	const suffix = input.endsWith('\n') || input.length === 0 ? '' : '\n';
	return `${input}${suffix}${line}\n`;
};

let vars = await readFile(envPath, 'utf8');

const secret = randomBytes(32).toString('base64url');
vars = upsertVar(vars, 'COOKIE_SECRET', secret);

const jwk = await generateClientAssertionKey('main-key');
vars = upsertVar(vars, 'CLIENT_ASSERTION_KEY', JSON.stringify(jwk));

await writeFile(envPath, vars);
console.log(`updated ${envPath}`);
```

### `src/routes/(oauth)/oauth/callback/+server.ts`

```ts
import { redirect } from '@sveltejs/kit';
import { createOAuthClient } from '$lib/atproto/server/oauth';
import { setSignedCookie } from '$lib/atproto/server/signed-cookie';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, platform, cookies }) => {
	const oauth = createOAuthClient(platform?.env);

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
```

### `src/routes/(oauth)/oauth/jwks.json/+server.ts`

```ts
import { json } from '@sveltejs/kit';
import { createOAuthClient } from '$lib/atproto/server/oauth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
	const oauth = createOAuthClient(platform?.env);
	return json(oauth.jwks ?? { keys: [] });
};
```

### `src/routes/(oauth)/oauth-client-metadata.json/+server.ts`

```ts
import { json } from '@sveltejs/kit';
import { createOAuthClient } from '$lib/atproto/server/oauth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
	const oauth = createOAuthClient(platform?.env);
	return json(oauth.metadata);
};
```

### `.env.example`

```
# Generate both with: pnpm env:setup-dev
CLIENT_ASSERTION_KEY=
COOKIE_SECRET=

# Set to your tunnel URL to use a confidential client in dev
# OAUTH_PUBLIC_URL=https://your-tunnel.trycloudflare.com
```

## Step 3: Modify existing files

### `src/app.d.ts`

Add these to the existing `App` namespace. Merge with any existing `Locals` or `Platform` fields — do not remove existing fields.

```ts
import type { OAuthSession } from '@atcute/oauth-node-client';
import type { Client } from '@atcute/client';
import type { Did } from '@atcute/lexicons';
```

Add to `App.Locals`:

```ts
session: OAuthSession | null;
client: Client | null;
did: Did | null;
```

Add to `App.Platform`:

```ts
env: {
  OAUTH_SESSIONS: KVNamespace;
  OAUTH_STATES: KVNamespace;
  CLIENT_ASSERTION_KEY: string;
  COOKIE_SECRET: string;
  OAUTH_PUBLIC_URL: string;
  PROFILE_CACHE?: KVNamespace;
};
```

Add at the bottom of the file (for lexicon type augmentation):

```ts
import type {} from '@atcute/atproto';
import type {} from '@atcute/bluesky';
```

### `src/hooks.server.ts`

Add session restoration. If the file already has a `handle` export, wrap both in `sequence()` from `@sveltejs/kit`.

```ts
import type { Handle } from '@sveltejs/kit';
import { restoreSession } from '$lib/atproto/server/session';

const atprotoHandle: Handle = async ({ event, resolve }) => {
  const { session, client, did } = await restoreSession(
    event.cookies, event.platform?.env
  );
  event.locals.session = session;
  event.locals.client = client;
  event.locals.did = did;
  return resolve(event);
};
```

If no existing hooks: `export const handle = atprotoHandle;`

If existing hooks: `export const handle = sequence(existingHandle, atprotoHandle);` (import `sequence` from `@sveltejs/kit`)

### `src/routes/+layout.server.ts`

Add profile loading. Merge with any existing load function.

```ts
import type { LayoutServerLoad } from './$types';
import { loadProfile } from '$lib/atproto/server/profile';

export const load: LayoutServerLoad = async ({ locals, platform }) => {
  if (!locals.did) return { did: null, profile: null };
  const profile = await loadProfile(locals.did, platform?.env?.PROFILE_CACHE);
  return { did: locals.did, profile };
};
```

If a load function already exists, merge the profile data into its return value.

### `src/routes/+layout.svelte` (foxui only)

Only if the user chose `foxui`. Add the login modal to the existing layout:

```svelte
<script lang="ts">
  import { AtprotoLoginModal } from '@foxui/social';
  import { login, signup } from '$lib/atproto';
</script>

<!-- keep existing layout content, add this at the bottom: -->
<AtprotoLoginModal
  login={async (handle) => {
    await login(handle);
    return true;
  }}
  signup={async () => {
    signup();
    return true;
  }}
/>
```

To show the modal from anywhere, use `@foxui/social` state and `@foxui/core` components:

```svelte
<script lang="ts">
  import { Button } from '@foxui/core';
  import { atProtoLoginModalState } from '@foxui/social';
  import { user, logout } from '$lib/atproto';
</script>

{#if user.isLoggedIn}
  <p>Signed in as {user.profile?.handle ?? user.did}</p>
  <Button onclick={() => logout()}>Sign Out</Button>
{:else}
  <Button onclick={() => atProtoLoginModalState.show()}>Sign In</Button>
{/if}
```

`@foxui/core` also exports `Avatar`, `Input`, and other UI primitives you can use.

### `src/routes/user/+page.svelte` (basic only)

Only if the user chose `basic`. Create this file:

```svelte
<script lang="ts">
  import { user, login, logout } from '$lib/atproto';

  let handle = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleLogin() {
    if (!handle.trim()) return;
    loading = true;
    error = '';
    try {
      await login(handle);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Login failed';
      loading = false;
    }
  }
</script>

<div class="mx-auto max-w-sm p-8">
  {#if user.isLoggedIn}
    <p class="mb-4">Signed in as <strong>{user.profile?.handle ?? user.did}</strong></p>
    <button
      class="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
      onclick={() => logout()}
    >
      Sign Out
    </button>
  {:else}
    <h1 class="mb-4 text-xl font-bold">Sign in</h1>
    <form onsubmit={handleLogin} class="flex flex-col gap-3">
      <input
        type="text"
        bind:value={handle}
        placeholder="handle.bsky.social"
        class="rounded border px-3 py-2"
        disabled={loading}
      />
      {#if error}
        <p class="text-sm text-red-600">{error}</p>
      {/if}
      <button
        type="submit"
        class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        disabled={loading || !handle.trim()}
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  {/if}
</div>
```

If the project does not use Tailwind, replace the Tailwind classes with plain inline styles.

### `svelte.config.js`

Add `remoteFunctions: true` inside `kit.experimental`:

```js
kit: {
  adapter: adapter(),
  experimental: {
    remoteFunctions: true
  }
}
```

If `experimental` already exists, merge into it. Do not remove other experimental flags.

### `vite.config.ts`

Add dev server config for loopback OAuth:

```ts
server: {
  host: '127.0.0.1',
  port: 5183
}
```

Add this inside `defineConfig()`. Do not remove existing plugins or config.

### `wrangler.jsonc`

Add or merge these fields:

- Add `"nodejs_compat_v2"` to `compatibility_flags` (create the array if it doesn't exist)
- Add `"OAUTH_PUBLIC_URL": "https://your-domain.com"` to `vars` (create `vars` if needed)
- Add KV namespace placeholders to `kv_namespaces`:

```jsonc
{ "binding": "OAUTH_SESSIONS", "id": "TODO" },
{ "binding": "OAUTH_STATES", "id": "TODO" }
```

Do not remove existing bindings or vars.

### `tsconfig.json`

Add `"@cloudflare/workers-types"` to `compilerOptions.types`. Create the `types` array if it doesn't exist.

### `package.json`

Add these to the `scripts` section:

```json
"env:generate-key": "npx tsx src/lib/atproto/scripts/generate-key.ts",
"env:generate-secret": "npx tsx src/lib/atproto/scripts/generate-secret.ts",
"env:setup-dev": "npx tsx src/lib/atproto/scripts/setup-dev.ts"
```

### `.gitignore`

Ensure these lines are present:

```
.env
.env.*
!.env.example
```

## Step 4: Run setup and verify

1. Run `pnpm env:setup-dev` to generate secrets in `.env`
2. Run `pnpm dev` to start the dev server
3. Verify it starts on `http://127.0.0.1:5183`
4. Tell the user:
   - Dev mode uses a loopback client (no keys needed)
   - For production: create KV namespaces with `npx wrangler kv namespace create OAUTH_SESSIONS` and `OAUTH_STATES`, update the IDs in `wrangler.jsonc`, set `OAUTH_PUBLIC_URL` to their domain, and run `npx wrangler secret put CLIENT_ASSERTION_KEY` / `COOKIE_SECRET` with values from `pnpm env:generate-key` / `pnpm env:generate-secret`

## Usage examples

### Login / Logout

```svelte
<script lang="ts">
  import { user, login, logout } from '$lib/atproto';
</script>

{#if user.isLoggedIn}
  <p>Signed in as {user.did}</p>
  <button onclick={() => logout()}>Sign Out</button>
{:else}
  <button onclick={() => login('user.bsky.social')}>Sign In</button>
{/if}
```

### Write operations

```ts
import { putRecord, deleteRecord, uploadBlob, createTID } from '$lib/atproto';

await putRecord({
  collection: 'your.collection.name',
  rkey: createTID(),
  record: { text: 'hello', createdAt: new Date().toISOString() }
});

await deleteRecord({ collection: 'your.collection.name', rkey: 'some-key' });

const blob = await uploadBlob({ blob: file });
```

### Read operations (no auth needed)

```ts
import { listRecords, getRecord, getDetailedProfile } from '$lib/atproto';

const records = await listRecords({ did: 'did:plc:...', collection: 'your.collection.name' });
const profile = await getDetailedProfile({ did: 'did:plc:...' });
```

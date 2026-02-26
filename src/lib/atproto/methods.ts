import { parseResourceUri, type Did, type Handle } from '@atcute/lexicons';
import { user } from './auth.svelte';
import type { AllowedCollection } from './settings';
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

/**
 * Parses an AT Protocol URI into its components.
 */
export function parseUri(uri: string) {
	const parts = parseResourceUri(uri);
	if (!parts.ok) return;
	return parts.value;
}

/**
 * Resolves a handle to a DID using DNS and HTTP methods.
 */
export async function resolveHandle({ handle }: { handle: Handle }) {
	const handleResolver = new CompositeHandleResolver({
		methods: {
			dns: new DohJsonHandleResolver({ dohUrl: 'https://mozilla.cloudflare-dns.com/dns-query' }),
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

/**
 * Gets the PDS (Personal Data Server) URL for a given DID.
 */
export async function getPDS(did: Did) {
	const doc = await didResolver.resolve(did as Did<'plc'> | Did<'web'>);
	if (!doc.service) throw new Error('No PDS found');
	for (const service of doc.service) {
		if (service.id === '#atproto_pds') {
			return service.serviceEndpoint.toString();
		}
	}
}

/**
 * Fetches a detailed Bluesky profile for a user.
 */
export async function getDetailedProfile(data?: { did?: Did; client?: Client }) {
	data ??= {};
	data.did ??= user.did;

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

/**
 * Creates an AT Protocol client for a user's PDS.
 */
export async function getClient({ did }: { did: Did }) {
	const pds = await getPDS(did);
	if (!pds) throw new Error('PDS not found');

	const client = new Client({
		handler: simpleFetchHandler({ service: pds })
	});

	return client;
}

/**
 * Lists records from a repository collection with pagination support.
 */
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
	did ??= user.did;
	if (!collection) {
		throw new Error('Missing parameters for listRecords');
	}
	if (!did) {
		throw new Error('Missing did for getRecord');
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

/**
 * Fetches a single record from a repository.
 */
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
	did ??= user.did;

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

/**
 * Creates or updates a record via the server API route.
 */
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

	const response = await fetch('/api/repo/putRecord', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ collection, rkey, record })
	});

	if (!response.ok) {
		throw new Error('Failed to put record');
	}

	return { ok: true, data: await response.json() };
}

/**
 * Deletes a record via the server API route.
 */
export async function deleteRecord({
	collection,
	rkey = 'self'
}: {
	collection: AllowedCollection;
	rkey: string;
}) {
	if (!user.did) throw new Error('Not logged in');

	const response = await fetch('/api/repo/deleteRecord', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ collection, rkey })
	});

	if (!response.ok) {
		throw new Error('Failed to delete record');
	}

	const data = (await response.json()) as { ok: boolean };
	return data.ok;
}

/**
 * Uploads a blob via the server API route.
 */
export async function uploadBlob({ blob }: { blob: Blob }) {
	if (!user.did) throw new Error("Can't upload blob: Not logged in");

	const response = await fetch('/api/repo/uploadBlob', {
		method: 'POST',
		body: blob
	});

	if (!response.ok) return;

	const blobInfo = (await response.json()) as {
		$type: 'blob';
		ref: {
			$link: string;
		};
		mimeType: string;
		size: number;
	};

	return blobInfo;
}

/**
 * Gets metadata about a repository.
 */
export async function describeRepo({ client, did }: { client?: Client; did?: Did }) {
	did ??= user.did;
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

/**
 * Constructs a URL to fetch a blob directly from a user's PDS.
 */
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

/**
 * Constructs a Bluesky CDN URL for an image blob.
 */
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
	did ??= user.did;

	return `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${blob.ref.$link}@webp`;
}

/**
 * Searches for actors with typeahead/autocomplete functionality.
 */
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

/**
 * Return a TID based on current time
 */
export function createTID() {
	return TID.now();
}

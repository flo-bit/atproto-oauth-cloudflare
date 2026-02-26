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
import { DOH_RESOLVER, REDIRECT_PATH } from '$lib/atproto/settings';
import { scope } from '$lib/atproto/metadata';
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
	// Fallback to in-memory stores (dev without wrangler)
	return {
		sessions: new MemoryStore<Did, StoredSession>(),
		states: new MemoryStore<string, StoredState>({ ttl: 600_000 })
	};
}

export function createOAuthClient(env?: App.Platform['env']): OAuthClient {
	const actorResolver = createActorResolver();
	const stores = createStores(env);

	if (dev) {
		// In development, use loopback client (public, no keyset).
		// Omit client_id — the library builds it automatically from redirect_uris + scope.
		// redirect_uris must use 127.0.0.1 (not localhost).
		return new OAuthClient({
			metadata: {
				redirect_uris: [`http://127.0.0.1:5183${REDIRECT_PATH}`],
				scope
			},
			actorResolver,
			stores
		});
	}

	// In production, use confidential client with keyset
	const key: ClientAssertionPrivateJwk = JSON.parse(env!.CLIENT_ASSERTION_KEY);
	const SITE = 'https://flo-bit.dev';

	return new OAuthClient({
		metadata: {
			client_id: SITE + '/oauth-client-metadata.json',
			redirect_uris: [SITE + REDIRECT_PATH],
			scope,
			jwks_uri: SITE + '/oauth/jwks.json'
		},
		keyset: [key],
		actorResolver,
		stores
	});
}

export type { OAuthSession };

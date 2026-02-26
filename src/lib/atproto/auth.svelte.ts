import { AppBskyActorDefs } from '@atcute/bluesky';
import type { ActorIdentifier, Did } from '@atcute/lexicons';
import { signUpPDS } from './settings';

export const user = $state({
	profile: null as AppBskyActorDefs.ProfileViewDetailed | null | undefined,
	isInitializing: true,
	isLoggedIn: false,
	did: undefined as Did | undefined
});

export function initFromServer(data: { did?: Did; profile?: AppBskyActorDefs.ProfileViewDetailed }) {
	if (data.did) {
		user.did = data.did as Did;
		user.profile = data.profile ?? null;
		user.isLoggedIn = true;

		// Cache profile in localStorage for UX
		if (data.profile && typeof localStorage !== 'undefined') {
			try {
				localStorage.setItem(`profile-${data.did}`, JSON.stringify(data.profile));
			} catch {}
		}
	}
	user.isInitializing = false;
}

export async function login(handle: ActorIdentifier) {
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

	const response = await fetch('/oauth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ handle })
	});

	if (!response.ok) {
		const err = (await response.json().catch(() => null)) as { message?: string } | null;
		throw new Error(err?.message || 'Login failed');
	}

	const { url } = (await response.json()) as { url: string };
	window.location.assign(url);

	// Wait for navigation (prevents UI flash)
	await new Promise((_resolve, reject) => {
		window.addEventListener('pageshow', () => reject(new Error('user aborted the login request')), {
			once: true
		});
	});
}

export async function signup() {
	const response = await fetch('/oauth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ signup: true })
	});

	if (!response.ok) {
		throw new Error('Signup failed');
	}

	const { url } = (await response.json()) as { url: string };
	window.location.assign(url);

	await new Promise((_resolve, reject) => {
		window.addEventListener('pageshow', () => reject(new Error('user aborted the signup request')), {
			once: true
		});
	});
}

export async function logout() {
	const did = user.did;

	try {
		await fetch('/oauth/logout', { method: 'POST' });
	} catch (e) {
		console.error('Error logging out:', e);
	}

	if (did && typeof localStorage !== 'undefined') {
		localStorage.removeItem(`profile-${did}`);
	}

	user.profile = null;
	user.isLoggedIn = false;
	user.did = undefined;
}

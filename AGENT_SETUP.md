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

4. **Signup**: Should the app allow users to create new AT Protocol accounts (signup)?
   - **`yes`** — Include a signup button/flow
   - **`no`** — Login only, no account creation

5. **Production PDS**: Which PDS should be used for signup in production? (default: `https://selfhosted.social/`)
   - Only relevant if signup is enabled. Skip if signup is `no`.

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

Fetch each file from the URL and write it to the specified path. All files go into `src/lib/atproto/` and `src/routes/(oauth)/`.

**Base URL:** `https://raw.githubusercontent.com/flo-bit/atproto-oauth-cloudflare/main/`

### `src/lib/atproto/settings.ts`

**Do not fetch this file.** Create it manually using the template below, customized with the user's answers:

```ts
import { dev } from '$app/environment';
import { scope } from '@atcute/oauth-node-client';

// CUSTOMIZE: writable collections
export const collections = [] as const;

export type AllowedCollection = (typeof collections)[number];

// CUSTOMIZE: OAuth scope — add scope.blob({ accept: ['image/*'] }), scope.rpc(), etc. as needed
export const scopes = ['atproto', scope.repo({ collection: [...collections] })];

// CUSTOMIZE: set to true to allow signup, false for login-only
export const ALLOW_SIGNUP = true;

// CUSTOMIZE: PDS to use for signup (only relevant if ALLOW_SIGNUP is true)
const devPDS = 'https://bsky.social/';
const prodPDS = 'https://selfhosted.social/'; // CUSTOMIZE: change to preferred production PDS
export const signUpPDS = dev ? devPDS : prodPDS;

export const REDIRECT_PATH = '/oauth/callback';

// redirect the user back to the page they were on before login
export const REDIRECT_TO_LAST_PAGE_ON_LOGIN = true;

export const DOH_RESOLVER = 'https://mozilla.cloudflare-dns.com/dns-query';
```

### Files to fetch

Fetch each file from `{BASE_URL}{path}` and write it to the same path in the project:

| Path | Description |
|------|-------------|
| `src/lib/atproto/auth.svelte.ts` | Client-side login/signup/logout + user state |
| `src/lib/atproto/methods.ts` | AT Protocol helpers (resolve, read records, write, etc.) |
| `src/lib/atproto/image-helper.ts` | Image compression + upload helpers |
| `src/lib/atproto/index.ts` | Re-exports (remove `signup` if `ALLOW_SIGNUP = false`) |
| `src/lib/atproto/server/signed-cookie.ts` | HMAC-signed cookie helpers |
| `src/lib/atproto/server/kv-store.ts` | KV-backed Store implementation |
| `src/lib/atproto/server/oauth.ts` | OAuthClient factory (dev vs prod) |
| `src/lib/atproto/server/oauth.remote.ts` | Login/logout remote functions |
| `src/lib/atproto/server/repo.remote.ts` | putRecord/deleteRecord/uploadBlob remote functions |
| `src/lib/atproto/server/session.ts` | Session restoration + scope invalidation |
| `src/lib/atproto/server/profile.ts` | Profile loading with optional KV cache |
| `src/lib/atproto/scripts/generate-key.ts` | Generate client assertion key |
| `src/lib/atproto/scripts/generate-secret.ts` | Generate cookie secret |
| `src/lib/atproto/scripts/setup-dev.ts` | Dev environment setup script |
| `src/routes/(oauth)/oauth/callback/+server.ts` | OAuth callback handler |
| `src/routes/(oauth)/oauth/jwks.json/+server.ts` | JWKS endpoint |
| `src/routes/(oauth)/oauth-client-metadata.json/+server.ts` | Client metadata endpoint |
| `.env.example` | Environment variable template |

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

Only if the user chose `foxui`. Add the login modal to the existing layout.

If signup is enabled (`ALLOW_SIGNUP = true`):

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

If signup is disabled (`ALLOW_SIGNUP = false`), omit the `signup` prop:

```svelte
<script lang="ts">
  import { AtprotoLoginModal } from '@foxui/social';
  import { login } from '$lib/atproto';
</script>

<AtprotoLoginModal
  login={async (handle) => {
    await login(handle);
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
- Do NOT add `OAUTH_PUBLIC_URL` to vars — it is only needed for production deployment and the user will set it themselves later. In dev mode without it, the app uses a loopback client automatically.
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

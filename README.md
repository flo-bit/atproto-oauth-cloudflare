# svelte atproto cloudflare workers oauth

SvelteKit + AT Protocol OAuth on Cloudflare Workers. Server-side OAuth with `@atcute/oauth-node-client`, Cloudflare KV for session/state storage, and SvelteKit remote functions for type-safe client-server communication.

## Quick Start

```sh
pnpm install
pnpm dev
```

In dev mode the app uses a **loopback OAuth client** (no keys, in-memory storage). It binds to `127.0.0.1:5183` — required for AT Protocol loopback OAuth.

### Dev with tunnel (confidential client)

To test the full production flow locally with a tunnel like [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

```sh
pnpm env:setup-dev                              # generates secrets in .env
# add OAUTH_PUBLIC_URL=https://your-tunnel.trycloudflare.com to .env
cloudflared tunnel --url http://localhost:5183   # start tunnel
pnpm dev                                        # start dev server
```

## Production Deployment

### 1. Create KV namespaces

```sh
npx wrangler kv namespace create OAUTH_SESSIONS
npx wrangler kv namespace create OAUTH_STATES
```

Add the IDs to `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  { "binding": "OAUTH_SESSIONS", "id": "<your-id>" },
  { "binding": "OAUTH_STATES", "id": "<your-id>" }
]
```

### 2. Set your public URL

In `wrangler.jsonc`:

```jsonc
"vars": {
  "OAUTH_PUBLIC_URL": "https://your-domain.com"
}
```

### 3. Generate and set secrets

```sh
pnpm env:generate-key
npx wrangler secret put CLIENT_ASSERTION_KEY    # paste generated key

pnpm env:generate-secret
npx wrangler secret put COOKIE_SECRET           # paste generated secret
```

### 4. Configure permissions

Edit `src/lib/atproto/settings.ts`:

```ts
export const permissions = {
  collections: ['xyz.statusphere.status'],  // collections your app can read/write
  rpc: {},                                   // authenticated RPC requests
  blobs: []                                  // blob types your app can upload
} as const;
```

The OAuth scope is auto-generated from this config.

### 5. Deploy

```sh
npx wrangler deploy
```

Set up a custom domain in the Cloudflare dashboard (Worker > Settings > Domains & Routes) so the OAuth client metadata URL matches your `client_id`.

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start dev server |
| `pnpm build` | Build for production |
| `pnpm check` | Run svelte-check |
| `pnpm env:generate-key` | Generate client assertion key |
| `pnpm env:generate-secret` | Generate cookie signing secret |
| `pnpm env:setup-dev` | Generate both and write to `.env` |

## Adding to an existing project

**With an AI agent** — paste this into Claude Code (or similar) in your existing repo:

```
add atproto oauth to this project https://raw.githubusercontent.com/flo-bit/svelte-atproto-oauth-cloudflare-workers/main/AGENT_SETUP.md
```

The [agent prompt](AGENT_SETUP.md) will ask you a few questions and set everything up.

**Manually** — see [SETUP.md](SETUP.md) for a step-by-step guide.

## Project Structure

```
src/lib/atproto/
├── auth.svelte.ts          # Client-side auth state & login/logout/signup
├── index.ts                # Public exports
├── metadata.ts             # OAuth scope from permissions
├── methods.ts              # AT Protocol helpers (read/write/resolve)
├── settings.ts             # Permissions config, constants
├── server/
│   ├── oauth.ts            # OAuthClient factory (loopback vs confidential)
│   ├── oauth.remote.ts     # Remote functions: login, logout
│   ├── repo.remote.ts      # Remote functions: putRecord, deleteRecord, uploadBlob
│   ├── session.ts          # Session restoration from signed cookie
│   ├── profile.ts          # Profile loading with optional KV cache
│   ├── kv-store.ts         # Cloudflare KV-backed Store
│   └── signed-cookie.ts    # HMAC-signed cookie helpers
└── scripts/
    ├── generate-key.ts
    ├── generate-secret.ts
    └── setup-dev.ts

src/routes/(oauth)/
├── oauth/callback/+server.ts
├── oauth/jwks.json/+server.ts
└── oauth-client-metadata.json/+server.ts
```

## How It Works

- **Auth**: Server-side OAuth via `@atcute/oauth-node-client`. Sessions stored in KV, identified by HMAC-signed `did` cookie.
- **Remote functions**: Write operations and auth actions use SvelteKit remote functions — type-safe server calls without manual API routes.
- **Dev mode**: Loopback client by default. Set `OAUTH_PUBLIC_URL` in `.env` for confidential client via tunnel.
- **Prod mode**: Confidential client with `private_key_jwt`, KV stores, `OAUTH_PUBLIC_URL` from `wrangler.jsonc`.

## License

MIT

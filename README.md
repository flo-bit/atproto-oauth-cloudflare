# svelte atproto client oauth demo

this is a scaffold for how to get client side oauth working with sveltekit and atproto 
using the [`atcute`](https://github.com/mary-ext/atcute) libraries.

useful when you want people to login to your static sveltekit site.

## how to install

### either clone this repo

1. clone this repo
2. run `pnpm install`
3. run `pnpm run dev`
4. go to `http://127.0.0.1:5179`
5. if necessary change base in `svelte.config.js`

```js
const config = {
	// ...

	kit: {
		// ...

		paths: {
			base: process.env.NODE_ENV === 'development' ? '' : '/svelte-atproto-client-oauth'
		}
	}
};
```

### or manually install in your own project

1. copy the `src/lib/oauth` folder into your own project
2. also copy the `src/routes/oauth-client-metadata.json.json` folder into your project
3. initialize the client in your `src/routes/+layout.svelte`

```svelte
<script>
	import { initClient } from '$lib/oauth';

	let { children } = $props();

	onMount(() => {
		initClient();
	});
</script>

{@render children()}
```

4. add server and port to your `vite.config.ts`

```js
export default defineConfig({
	server: {
		host: '127.0.0.1',
		port: 5179
	}
});
```

5. install the dependencies

```bash
npm install @atcute/atproto @atcute/bluesky @atcute/identity-resolver @atcute/lexicons @atcute/oauth-browser-client @atcute/client
```

6. set your base in `svelte.config.js` (e.g. for github pages: `base: '/your-repo-name/'`) while keeping it as `''` in development.

```ts
const config = {
	// ...

	kit: {
		// ...

		paths: {
			base: process.env.NODE_ENV === 'development' ? '' : '/svelte-atproto-client-oauth'
		}
	}
};
```


## how to use

### login flow

Either use the `LoginModal` component to render a login modal or use the `user` object to handle the login flow yourself.

```ts
// handlin login flow yourself
import { user } from '$lib/oauth';

// methods:
user.login(handle);
user.signup();
user.isLoggedIn;
user.logout();
```

LoginModal is a component that renders a login modal, add it for a quick login flow. 
(copy the `src/lib/UI` folder into your projects `src/lib` folder)

```svelte
<script>
	import { LoginModal, loginModalState } from '$lib/oauth';
</script>

<LoginModal />

<button onclick={() => loginModalState.show()}>Show Login Modal</button>
```

### make requests

Get the user's profile and make requests with the `user.client` object.

```ts
import { user } from '$lib/oauth';

// make requests with the user.client object
const response = await user.client.get('app.bsky.feed.getActorLikes', {
	params: {
		actor: client.did,
		limit: 10
	}
});
```

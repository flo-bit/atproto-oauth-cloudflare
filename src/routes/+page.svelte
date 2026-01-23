<script lang="ts">
	import { user, logout } from '$lib/oauth';
	import Avatar from '$lib/UI/Avatar.svelte';
	import Button from '$lib/UI/Button.svelte';
	import { loginModalState } from '$lib/UI/LoginModal.svelte';
</script>

<div class="mx-auto my-4 max-w-3xl px-4 md:my-32">
	<h1 class="text-3xl font-bold">svelte atproto client oauth demo</h1>

	<a
		href="https://github.com/flo-bit/svelte-atproto-client-oauth"
		target="_blank"
		class="mt-2 text-sm text-rose-600">source code</a
	>

	{#if user.isInitializing}
		<div class="mt-8 text-sm">loading...</div>
	{/if}

	{#if !user.isInitializing && !user.agent}
		<div class="mt-8 text-sm">not signed in</div>
		<Button class="mt-4" onclick={() => loginModalState.show()}>Sign In</Button>
	{/if}

	{#if user.isLoggedIn}
		<div class="mt-8 text-sm">signed in as</div>

		<div class="mt-2 flex gap-1 font-semibold">
			<Avatar src={user.profile?.avatar} />
			<span>{user.profile?.displayName || user.profile?.handle}</span>
		</div>

		<Button class="mt-4" onclick={() => logout()}>Sign Out</Button>
	{/if}
</div>

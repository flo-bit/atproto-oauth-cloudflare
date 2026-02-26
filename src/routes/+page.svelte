<script lang="ts">
	import { user, logout } from '$lib/atproto';
	import Avatar from '$lib/atproto/UI/Avatar.svelte';
	import Button from '$lib/atproto/UI/Button.svelte';
	import { loginModalState } from '$lib/atproto/UI/LoginModal.svelte';
	import { createTID } from '$lib/atproto/methods';

	let emojis = ['😅', '🫶', '🤗', '🙃', '😊', '🤔'];
</script>

<div class="mx-auto my-4 max-w-3xl px-4 md:my-32">
	<h1 class="text-3xl font-bold">svelte atproto client oauth demo</h1>

	<a
		href="https://github.com/flo-bit/svelte-atproto-client-oauth"
		target="_blank"
		class="dark:text-accent-500 mt-2 text-sm text-rose-600">source code</a
	>

	{#if user.isInitializing}
		<div class="mt-8 text-sm">loading...</div>
	{/if}

	{#if !user.isInitializing && !user.isLoggedIn}
		<div class="mt-8 text-sm">not logged in</div>
		<Button class="mt-4" onclick={() => loginModalState.show()}>Login</Button>
	{/if}

	{#if user.isLoggedIn}
		<div class="mt-8 text-sm">signed in as</div>

		<div class="mt-2 flex gap-1 font-semibold">
			<Avatar src={user.profile?.avatar} />
			<span>{user.profile?.displayName || user.profile?.handle}</span>
		</div>

		<div class="my-4 text-sm">
			Statusphere test:
			<div class="mt-2 flex flex-wrap gap-2">
				{#each emojis as emoji}
					<button
						class="bg-base-100 dark:bg-base-950 cursor-pointer rounded-xl p-1 px-2"
						onclick={async () => {
							await fetch('/api/repo/putRecord', {
								method: 'POST',
								body: JSON.stringify({
									rkey: createTID(),
									collection: 'xyz.statusphere.status',
									record: {
										status: emoji,
										createdAt: new Date()
									}
								})
							});
						}}>{emoji}</button
					>
				{/each}
			</div>
		</div>

		<Button class="mt-4" onclick={() => logout()}>Sign Out</Button>
	{/if}
</div>

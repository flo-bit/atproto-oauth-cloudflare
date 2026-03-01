<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { flip } from 'svelte/animate';
	import { scale } from 'svelte/transition';
	import { user, logout } from '$lib/atproto';
	import { Button, Avatar } from '@foxui/core';
	import { atProtoLoginModalState, EmojiPicker } from '@foxui/social';
	import { RelativeTime } from '@foxui/time';

	import { createTID } from '$lib/atproto/methods';
	import { putRecord } from '$lib/atproto/server/repo.remote';

	let { data } = $props();
</script>

<div class="mx-auto my-4 max-w-3xl px-4 md:my-32">
	<h1 class="text-3xl font-bold">svelte atproto cloudflare workers oauth demo</h1>

	<a
		href="https://github.com/flo-bit/svelte-atproto-client-oauth"
		target="_blank"
		class="dark:text-accent-500 mt-2 text-sm text-rose-600">source code</a
	>

	{#if !user.isLoggedIn}
		<div class="mt-8 text-sm">not logged in</div>
		<Button class="mt-4" onclick={() => atProtoLoginModalState.show()}>Login</Button>
	{/if}

	{#if user.isLoggedIn}
		<div class="mt-8 text-sm">signed in as</div>

		<div class="mt-2 flex gap-1 font-semibold">
			<Avatar src={user.profile?.avatar} />
			<span>{user.profile?.displayName || user.profile?.handle}</span>
		</div>

		<div class="my-4 text-sm">
			Statusphere test:
			<EmojiPicker
				onpicked={async (emoji) => {
					await putRecord({
						rkey: createTID(),
						collection: 'xyz.statusphere.status',
						record: {
							status: emoji.unicode,
							createdAt: new Date()
						}
					});
					await invalidateAll();
				}}
			/>
			{#if data.statuses.length > 0}
				<div class="mt-4 text-sm">Recent statuses:</div>
				<ul class="mt-2">
					{#each data.statuses as status, i (status.rkey)}
						<li class="flex items-center gap-2 py-1" animate:flip={{ duration: 300 }}>
							{#if i === 0}
								<span class="text-2xl" in:scale={{ duration: 300 }}>{status.status}</span>
							{:else}
								<span class="text-2xl">{status.status}</span>
							{/if}
							<span class="text-base-400 dark:text-base-500 text-sm">
								<RelativeTime date={new Date(status.createdAt)} locale="en-US" />
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<Button class="mt-4" onclick={() => logout()}>Sign Out</Button>
	{/if}
</div>

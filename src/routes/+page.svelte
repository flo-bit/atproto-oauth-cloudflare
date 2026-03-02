<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { flip } from 'svelte/animate';
	import { scale } from 'svelte/transition';
	import { user, logout, uploadBlob } from '$lib/atproto';
	import { Button, Avatar } from '@foxui/core';
	import { atProtoLoginModalState, EmojiPicker } from '@foxui/social';
	import { RelativeTime } from '@foxui/time';

	import { createTID, getCDNImageBlobUrl } from '$lib/atproto/methods';
	import { putRecord } from '$lib/atproto/server/repo.remote';

	let { data } = $props();

	let uploading = $state(false);
	let fileInput: HTMLInputElement;

	async function handleImageUpload() {
		const file = fileInput?.files?.[0];
		if (!file) return;

		uploading = true;
		try {
			const blobRef = await uploadBlob({ blob: file });
			await putRecord({
				rkey: createTID(),
				collection: 'social.atmo.test.blob',
				record: {
					blob: blobRef,
					createdAt: new Date().toISOString()
				}
			});
			fileInput.value = '';
			await invalidateAll();
		} catch (e) {
			console.error('Upload failed:', e);
		} finally {
			uploading = false;
		}
	}
</script>

<div class="mx-auto my-4 max-w-3xl px-4 md:my-32">
	<h1 class="text-3xl font-bold">svelte atproto cloudflare workers oauth demo</h1>

	<a
		href="https://github.com/flo-bit/atproto-oauth-cloudflare"
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

		<div class="my-4 text-sm">
			<div class="font-semibold">Blob upload test:</div>
			<div class="mt-2 flex items-center gap-2">
				<input
					bind:this={fileInput}
					type="file"
					accept="image/*"
					onchange={handleImageUpload}
					disabled={uploading}
					class="text-sm file:mr-2 file:rounded file:border-0 file:bg-rose-100 file:px-3 file:py-1 file:text-sm file:text-rose-700 dark:file:bg-rose-900 dark:file:text-rose-200"
				/>
				{#if uploading}
					<span class="text-base-400 text-sm">uploading...</span>
				{/if}
			</div>

			{#if data.blobs.length > 0}
				<div class="mt-4 text-sm">Uploaded blobs:</div>
				<div class="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
					{#each data.blobs as blob (blob.rkey)}
						<div class="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
							<img
								src={getCDNImageBlobUrl({ did: user.did ?? undefined, blob: blob.blob })}
								alt="uploaded blob"
								class="aspect-square w-full object-cover"
							/>
							<div class="text-base-400 dark:text-base-500 p-1 text-center text-xs">
								<RelativeTime date={new Date(blob.createdAt)} locale="en-US" />
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<Button class="mt-4" onclick={() => logout()}>Sign Out</Button>
	{/if}
</div>

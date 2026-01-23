<script lang="ts" module>
	export const loginModalState = $state({
		visible: false,
		show: () => (loginModalState.visible = true),
		hide: () => (loginModalState.visible = false)
	});
</script>

<script lang="ts">
	import { login, signup } from '$lib/oauth/auth.svelte';
	import type { ActorIdentifier, Did } from '@atcute/lexicons';
	import Button from './Button.svelte';
	import { onMount, tick } from 'svelte';
	import SecondaryButton from './SecondaryButton.svelte';
	import HandleInput from './HandleInput.svelte';
	import { AppBskyActorDefs } from '@atcute/bluesky';
	import Avatar from './Avatar.svelte';

	let { signIn = true, loginOnSelect = true }: { signIn?: boolean; loginOnSelect?: boolean } =
		$props();

	let value = $state('');
	let error: string | null = $state(null);
	let loadingLogin = $state(false);
	let loadingSignup = $state(false);

	async function onSubmit(event?: Event) {
		event?.preventDefault();
		if (loadingLogin) return;

		error = null;
		loadingLogin = true;

		try {
			await login(value as ActorIdentifier);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loadingLogin = false;
		}
	}

	let input: HTMLInputElement | null = $state(null);

	$effect(() => {
		if (!loginModalState.visible) {
			error = null;
			value = '';
			loadingLogin = false;
			selectedActor = undefined;
		} else {
			tick().then(() => {
				input?.focus();
			});
		}
	});

	let selectedActor: AppBskyActorDefs.ProfileViewBasic | undefined = $state();

	let recentLogins: Record<Did, AppBskyActorDefs.ProfileViewBasic> = $state({});

	onMount(() => {
		try {
			recentLogins = JSON.parse(localStorage.getItem('recent-logins') || '{}');
		} catch {}
	});

	function removeRecentLogin(did: Did) {
		try {
			delete recentLogins[did];

			localStorage.setItem('recent-logins', JSON.stringify(recentLogins));
		} catch {}
	}
</script>

{#if loginModalState.visible}
	<div
		class="fixed inset-0 z-100 w-screen overflow-y-auto"
		aria-labelledby="modal-title"
		role="dialog"
		aria-modal="true"
	>
		<div
			class="fixed inset-0 bg-neutral-50/90 backdrop-blur-sm transition-opacity dark:bg-neutral-950/90"
			onclick={() => (loginModalState.visible = false)}
			aria-hidden="true"
		></div>

		<div class="pointer-events-none fixed inset-0 isolate z-10 w-screen overflow-y-auto">
			<div
				class="flex min-h-full w-screen items-end justify-center p-4 text-center sm:items-center sm:p-0"
			>
				<div
					class="pointer-events-auto relative w-full transform overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 px-4 pt-4 pb-4 text-left shadow-xl transition-all sm:my-8 sm:max-w-sm sm:p-6 dark:border-neutral-700 dark:bg-neutral-800"
				>
					<h3 class="font-semibold text-neutral-900 dark:text-neutral-100" id="modal-title">
						Login with your internet handle
					</h3>

					<div class="mt-2 mb-2 text-xs font-light text-neutral-800">e.g. your bluesky account</div>

					{#if Object.keys(recentLogins).length > 0 && !loadingLogin && !selectedActor}
						<div class="mt-2 mb-2 text-sm font-medium">Recent logins</div>
						<div class="flex flex-col gap-2">
							{#each Object.values(recentLogins) as recentLogin}
								<div class="group">
									<div
										class="group-hover:bg-base-300 bg-base-200 border-base-300 relative flex h-10 w-full items-center justify-between gap-2 rounded-full border px-2 font-semibold transition-colors duration-100"
									>
										<div class="flex items-center gap-2">
											<Avatar src={recentLogin.avatar} />
											{recentLogin.handle}
										</div>
										<button
											class="z-20 cursor-pointer"
											onclick={() => {
												value = recentLogin.handle;
												selectedActor = recentLogin;
												onSubmit();
											}}
										>
											<div class="absolute inset-0 h-full w-full"></div>
											<span class="sr-only">login</span>
										</button>

										<button
											onclick={() => {
												removeRecentLogin(recentLogin.did);
											}}
											class="z-30 cursor-pointer rounded-full p-0.5"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
												stroke-width="1.5"
												stroke="currentColor"
												class="size-3"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M6 18 18 6M6 6l12 12"
												/>
											</svg>
											<span class="sr-only">sign in with other account</span>
										</button>
									</div>
								</div>
							{/each}
						</div>

						<div class="mt-4 text-sm font-medium">Or new handle</div>
					{/if}

					<form onsubmit={onSubmit} class="mt-2 flex w-full flex-col gap-2">
						{#if !selectedActor}
							<div class="w-full">
								<HandleInput
									bind:value
									onselected={(a) => {
										selectedActor = a;
										value = a.handle;
										if (loginOnSelect) onSubmit();
									}}
									bind:ref={input}
								/>
							</div>
						{:else}
							<div
								class="bg-base-200 border-base-300 flex h-10 w-full items-center justify-between gap-2 rounded-full border px-2 font-semibold"
							>
								<div class="flex items-center gap-2">
									<Avatar src={selectedActor.avatar} />
									{selectedActor.handle}
								</div>

								<button
									onclick={() => {
										selectedActor = undefined;
										value = '';
									}}
									class="cursor-pointer rounded-full p-0.5"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										class="size-3"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
									</svg>
									<span class="sr-only">sign in with other account</span>
								</button>
							</div>
						{/if}

						{#if error}
							<p class="text-sm font-semibold text-rose-500">{error}</p>
						{/if}

						<div class="mt-4">
							<Button type="submit" disabled={loadingLogin} class="w-full"
								>{loadingLogin ? 'Loading...' : 'Login'}</Button
							>
						</div>

						{#if signIn}
							<div class="mt-4 border-t border-neutral-200 pt-4 text-sm leading-7 text-neutral-800">
								Don't have an account?
								<div class="mt-3">
									<SecondaryButton
										onclick={async () => {
											loadingSignup = true;
											await signup();
										}}
										disabled={loadingSignup}
										class="w-full">{loadingSignup ? 'Loading...' : 'Sign Up'}</SecondaryButton
									>
								</div>
							</div>
						{/if}
					</form>
				</div>
			</div>
		</div>
	</div>
{/if}

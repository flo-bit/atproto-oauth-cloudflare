<script lang="ts">
	import '../app.css';

	import { initFromServer } from '$lib/atproto';
	import LoginModal from '$lib/atproto/UI/LoginModal.svelte';

	let { children, data } = $props();

	$effect(() => {
		initFromServer({ did: data.did, profile: data.profile });
	});
</script>

{@render children()}

<LoginModal />

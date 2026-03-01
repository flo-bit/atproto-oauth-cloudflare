<script lang="ts">
	import '../app.css';
	import { AtprotoLoginModal } from '@foxui/social';
	import { login, signup } from '$lib/atproto';

	let { children } = $props();
</script>

{@render children()}

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
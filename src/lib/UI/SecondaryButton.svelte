<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		children: () => any;
	};

	let { children, class: className, ...props }: Props = $props();
</script>

<button
	class={[
		'bg-neutral-300 text-black transition-colors duration-100 hover:bg-neutral-200 focus-visible:outline-neutral-600',
		'inline-flex cursor-pointer justify-center rounded-full px-3 py-2 text-sm font-semibold shadow-sm focus-visible:outline focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
		className
	]}
	{...props}
>
	{@render children()}
</button>

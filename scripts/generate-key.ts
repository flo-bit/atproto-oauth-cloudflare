import { generateClientAssertionKey } from '@atcute/oauth-node-client';

const key = await generateClientAssertionKey('main-key');

console.log('Add this to your .dev.vars file:\n');
console.log(`CLIENT_ASSERTION_KEY=${JSON.stringify(JSON.stringify(key))}`);
console.log('\nFor Cloudflare Workers, add it as a secret:');
console.log('npx wrangler secret put CLIENT_ASSERTION_KEY');
console.log('(paste the JSON value without the outer quotes)');

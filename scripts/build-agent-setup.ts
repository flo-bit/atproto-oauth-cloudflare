import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const cwd = process.cwd();
const referencePath = resolve(cwd, 'AGENT_SETUP_REFERENCE.md');
const outputPath = resolve(cwd, 'AGENT_SETUP.md');

const LANG_MAP: Record<string, string> = {
	'.ts': 'ts',
	'.js': 'js',
	'.svelte': 'svelte',
	'.json': 'json',
	'.jsonc': 'jsonc'
};

let content = await readFile(referencePath, 'utf8');

const pattern = /^<!-- FILE: (.+?) -->$/gm;
let match;
const replacements: { full: string; filePath: string }[] = [];

while ((match = pattern.exec(content)) !== null) {
	replacements.push({ full: match[0], filePath: match[1] });
}

for (const { full, filePath } of replacements) {
	const absPath = resolve(cwd, filePath);
	let fileContent: string;
	try {
		fileContent = (await readFile(absPath, 'utf8')).trimEnd();
	} catch {
		console.error(`ERROR: file not found: ${filePath}`);
		process.exit(1);
	}

	const ext = extname(filePath);
	const lang = LANG_MAP[ext] ?? '';

	const codeBlock = '```' + lang + '\n' + fileContent + '\n```';
	// Use function replacer to avoid $` and $' special patterns in String.replace()
	content = content.replace(full, () => codeBlock);
}

await writeFile(outputPath, content);
console.log(`built ${outputPath} (${replacements.length} files inlined)`);

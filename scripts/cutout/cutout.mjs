import { removeBackground } from '@imgly/background-removal-node';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const [, , input, output] = process.argv;
const buf = await readFile(input);
const blob = new Blob([buf], { type: 'image/jpeg' });
const out = await removeBackground(blob, {
  model: 'medium',
  output: { format: 'image/png', quality: 1 },
  progress: (k, c, t) => { if (c === t) console.log('done', k); },
});
await writeFile(output, Buffer.from(await out.arrayBuffer()));
console.log('saved', pathToFileURL(output).href);

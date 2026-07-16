import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const path = join(dir, entry);
    const s = await stat(path);
    if (s.isDirectory()) out.push(...await walk(path));
    else if (path.endsWith('.js')) out.push(path);
  }
  return out;
}

function hasExtension(spec) {
  return /\.[a-zA-Z0-9]+$/.test(spec);
}

for (const file of await walk('.validation')) {
  let text = await readFile(file, 'utf8');
  text = text.replace(/(from\s+['"])(\.\.?\/[^'"]+)(['"])/g, (m, a, spec, b) => {
    if (hasExtension(spec)) return m;
    return `${a}${spec}.js${b}`;
  });
  text = text.replace(/(import\(\s*['"])(\.\.?\/[^'"]+)(['"]\s*\))/g, (m, a, spec, b) => {
    if (hasExtension(spec)) return m;
    return `${a}${spec}.js${b}`;
  });
  await writeFile(file, text);
}

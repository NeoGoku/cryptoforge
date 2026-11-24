import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

function releaseId() {
  const hash = createHash('sha256');
  function add(path: string) {
    hash.update(path + '\0');
    hash.update(readFileSync(new URL(path, import.meta.url)));
    hash.update('\0');
  }
  for (const file of ['index.html', 'package-lock.json', 'vite.config.ts']) add(file);
  for (const dir of ['src', 'public']) {
    const root = fileURLToPath(new URL(`${dir}/`, import.meta.url));
    const paths = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((file) => file.isFile())
      .map((file) => `${dir}/${relative(root, resolve(file.parentPath, file.name)).split(sep).join('/')}`);
    for (const path of paths.sort()) add(path);
  }
  return hash.digest('hex').slice(0, 16);
}

export default defineConfig(({ command }) => ({
  base: './',
  define: { __SAVE_RELEASE__: JSON.stringify(command === 'build' ? releaseId() : 'dev') },
}));

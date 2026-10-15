import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const originalFiles = await readdir(new URL('public/assets/textures/', root));
const entries = originalFiles.filter(name => /\.(jpg|png)$/.test(name)).flatMap(filename => {
  return ['textures', 'base'].map(directory => ({
    path: `assets/${directory}/${filename}`,
    sourceUrl: `https://www.solarsystemscope.com/textures/download/${filename}`,
    author: 'Solar System Scope / INOVE',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    accessedAt: '2026-10-13',
    modifications: directory === 'base' ? 'Resampled to 512 pixels wide with macOS sips.' : 'None.',
  }));
});
await writeFile(new URL('public/asset-credits.json', root), `${JSON.stringify(entries, null, 2)}\n`);
await mkdir(new URL('public/third-party/', root), { recursive: true });
const astronomySource = await readFile(new URL('node_modules/astronomy-engine/astronomy.js', root), 'utf8');
const licenseEnd = astronomySource.indexOf('*/');
if (licenseEnd < 0 || !astronomySource.slice(0, licenseEnd).includes('MIT License')) throw new Error('Astronomy license header missing');
await writeFile(new URL('public/third-party/astronomy-engine-LICENSE.txt', root), astronomySource.slice(0, licenseEnd + 2));
for (const [name, file] of [['three', 'LICENSE'], ['react', 'LICENSE'], ['react-dom', 'LICENSE']]) {
  const text = await readFile(new URL(`node_modules/${name}/${file}`, root), 'utf8');
  await writeFile(new URL(`public/third-party/${name}-LICENSE.txt`, root), text);
}

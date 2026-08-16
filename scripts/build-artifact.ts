/**
 * Bundles the demo page into a single self-contained HTML file.
 *
 * The Artifact host blocks every external request, so the library, the demo
 * script and the styles all have to be inlined. The page markup stays in
 * demo/index.html as the single source of truth — this script rewrites the
 * module <script> tag into an inline IIFE and strips the document shell the
 * host supplies itself.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'preview');
mkdirSync(outDir, { recursive: true });

const bundle = execFileSync(
  'npx',
  [
    'esbuild',
    join(root, 'demo/main.ts'),
    '--bundle',
    '--format=iife',
    '--target=es2020',
    '--minify',
    // Escapes non-ASCII in string literals, so the script survives being
    // parsed under any charset the host happens to declare.
    '--charset=ascii',
  ],
  { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
);

const html = readFileSync(join(root, 'demo/index.html'), 'utf8');

const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? 'Volter Graph';
const style = html.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';

if (!style || !body) throw new Error('build-artifact: could not extract style/body');

/**
 * The fragment carries no <meta charset> — the host supplies the document
 * head — so every non-ASCII character becomes a numeric entity. Em dashes
 * silently turning into "â€"" is the failure this prevents.
 */
function toEntities(text: string): string {
  return text.replace(/[^\x00-\x7F]/g, (ch) => `&#x${ch.codePointAt(0)!.toString(16)};`);
}

const script = bundle.trim();
const nonAscii = script.match(/[^\x00-\x7F]/g);
if (nonAscii) {
  throw new Error(
    `build-artifact: bundle contains ${nonAscii.length} non-ASCII characters; ` +
      'esbuild --charset=ascii should have escaped them'
  );
}

const page = [
  `<title>${toEntities(title)}</title>`,
  toEntities(style),
  toEntities(body.replace(/<script[\s\S]*?<\/script>/g, '').trimEnd()),
  `<script>${script}</script>`,
  '',
].join('\n');

const out = join(outDir, 'artifact.html');
writeFileSync(out, page);

const kb = (Buffer.byteLength(page) / 1024).toFixed(1);
console.log(`preview/artifact.html  ${kb} KB  (script ${(bundle.length / 1024).toFixed(1)} KB)`);

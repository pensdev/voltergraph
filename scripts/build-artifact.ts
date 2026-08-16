/**
 * Bundles the demo page into self-contained HTML with no build step needed to
 * view it.
 *
 * Two outputs from one source, because they have different hosts:
 *
 *   docs/index.html      A complete document. Double-click it from a clone, or
 *                        serve it as a GitHub Pages site. Committed.
 *   preview/artifact.html A fragment, for hosts that supply their own document
 *                        shell. Not committed.
 *
 * demo/index.html stays the single source of truth. It loads main.ts directly
 * so the dev server can hot-reload TypeScript; this script rewrites that tag
 * into an inline bundle so the page works from the filesystem.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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

const script = bundle.trim();
const nonAscii = script.match(/[^\x00-\x7F]/g);
if (nonAscii) {
  throw new Error(
    `build-artifact: bundle contains ${nonAscii.length} non-ASCII characters; ` +
      'esbuild --charset=ascii should have escaped them'
  );
}

const html = readFileSync(join(root, 'demo/index.html'), 'utf8');
const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? 'Volter Graph';
const style = html.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? '';
const rawBody = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';

if (!style || !rawBody) throw new Error('build-artifact: could not extract style/body');

/**
 * The fragment carries no <meta charset> — its host supplies the document head
 * — so every non-ASCII character becomes a numeric entity. Em dashes silently
 * turning into "â€"" is the failure this prevents.
 */
function toEntities(text: string): string {
  return text.replace(/[^\x00-\x7F]/g, (ch) => `&#x${ch.codePointAt(0)!.toString(16)};`);
}

const body = toEntities(rawBody.replace(/<script[\s\S]*?<\/script>/g, '').trimEnd());
const styleText = toEntities(style);
const titleText = toEntities(title);

function emit(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  console.log(`${path.replace(root + '/', '')}  ${(Buffer.byteLength(contents) / 1024).toFixed(1)} KB`);
}

emit(
  join(root, 'docs/index.html'),
  [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${titleText}</title>`,
    styleText,
    '</head>',
    '<body>',
    body,
    `<script>${script}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n')
);

emit(
  join(root, 'preview/artifact.html'),
  [`<title>${titleText}</title>`, styleText, body, `<script>${script}</script>`, ''].join('\n')
);

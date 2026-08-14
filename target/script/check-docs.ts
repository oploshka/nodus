import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const markdownName = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const markdownLink = /\[[^\]]*\]\(([^)]+)\)/g;

const errors: string[] = [];

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }

  return files;
}

function relative(file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

function localLinkTarget(rawTarget: string): string | null {
  const target = rawTarget.trim().replace(/^<|>$/g, '');
  if (!target || target.startsWith('#')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null;

  const withoutAnchor = target.split('#', 1)[0];
  return withoutAnchor ? decodeURIComponent(withoutAnchor) : null;
}

async function checkMarkdownFile(file: string): Promise<void> {
  const rel = relative(file);
  const basename = path.basename(file);

  if (rel !== 'README.md' && !markdownName.test(basename)) {
    errors.push(`${rel}: documentation filename must use lowercase kebab-case`);
  }

  if (basename === 'README.md' && rel !== 'README.md') {
    errors.push(`${rel}: README.md is reserved for the repository root`);
  }

  const content = await readFile(file, 'utf8');
  for (const match of content.matchAll(markdownLink)) {
    const target = localLinkTarget(match[1]);
    if (!target) continue;

    const resolved = path.resolve(path.dirname(file), target);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      errors.push(`${rel}: local link escapes repository: ${match[1]}`);
      continue;
    }

    try {
      await stat(resolved);
    } catch {
      errors.push(`${rel}: broken local link: ${match[1]}`);
    }
  }
}

const files = await walk(root);
const markdownFiles = files.filter((file) => file.endsWith('.md'));

for (const file of markdownFiles) {
  await checkMarkdownFile(file);
}

if (errors.length > 0) {
  console.error('Documentation consistency check failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Documentation consistency check passed (${markdownFiles.length} Markdown files).`);
}

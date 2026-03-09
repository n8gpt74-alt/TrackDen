import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ASSETS_DIR = path.join(path.resolve('dist'), 'assets');

// Guard against a regression where Cyrillic UI text ends up double-escaped in the bundle
// and renders literally as "\\u041f..." instead of real letters.
const DOUBLE_ESCAPED_UNICODE_PATTERNS = [
  {
    name: 'double-escaped-cyrillic-run-\\\\u04xx',
    regex: /(?:\\\\u04[0-9A-Fa-f]{2}){3,}/g,
  },
  {
    name: 'double-escaped-cyrillic-run-\\\\U04xx',
    regex: /(?:\\\\U04[0-9A-Fa-f]{2}){3,}/g,
  },
  {
    name: 'double-escaped-cyrillic-run-\\\\U00004xxx',
    regex: /(?:\\\\U00004[0-9A-Fa-f]{3}){3,}/g,
  },
];

function formatPointer(text, index) {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + 80);
  const snippet = text.slice(start, end).replace(/\s+/g, ' ');
  return { snippet };
}

async function dirExists(dirPath) {
  try {
    const info = await stat(dirPath);
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function main() {
  if (!(await dirExists(ASSETS_DIR))) {
    console.error(`[check:dist-text] Missing ${ASSETS_DIR}. Run \`npm run build\` first.`);
    process.exit(1);
  }

  const entries = await readdir(ASSETS_DIR, { withFileTypes: true });
  const jsFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(ASSETS_DIR, entry.name));

  if (jsFiles.length === 0) {
    console.error('[check:dist-text] No built JS assets found in dist/assets.');
    process.exit(1);
  }

  const findings = [];

  for (const filePath of jsFiles) {
    const text = await readFile(filePath, 'utf8');

    for (const pattern of DOUBLE_ESCAPED_UNICODE_PATTERNS) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(text);
      if (!match) continue;

      const index = match.index ?? 0;
      const { snippet } = formatPointer(text, index);

      findings.push({
        file: path.relative(process.cwd(), filePath).replaceAll('\\', '/'),
        pattern: pattern.name,
        index,
        snippet,
      });
    }
  }

  if (findings.length > 0) {
    console.error('[check:dist-text] Found double-escaped unicode sequences in build output.');
    console.error('[check:dist-text] UI will show literal \\\\u041f... / \\\\U0000041F... instead of Russian letters.');
    console.error('[check:dist-text] This is a regression guard: fix the source strings/encoding and rebuild.\n');

    for (const item of findings.slice(0, 10)) {
      console.error(`- ${item.file} @${item.index} (${item.pattern}): ${item.snippet}`);
    }

    if (findings.length > 10) {
      console.error(`...and ${findings.length - 10} more.`);
    }

    process.exit(1);
  }

  console.log('[check:dist-text] OK: no double-escaped Cyrillic escape runs found.');
}

await main();
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const problems = [];
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile()) files.push(file);
  }
}
walk(root);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.type !== 'module') problems.push('package.json must use native ES modules.');
for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  if (Object.keys(pkg[field] || {}).length) problems.push(`${field} must remain empty: this project has no npm dependencies.`);
}
for (const required of ['index.html', 'README.md', 'LICENSE']) {
  if (!fs.existsSync(path.join(root, required))) problems.push(`Missing ${required}.`);
}

const jsFiles = files.filter(file => /\.(?:m?js)$/u.test(file));
for (const file of jsFiles) {
  const label = path.relative(root, file);
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status !== 0) problems.push(`${label}: ${syntax.stderr.trim() || syntax.error?.message || 'Syntax check failed.'}`);
  const source = fs.readFileSync(file, 'utf8');
  const patterns = [
    /\b(?:import|export)\s+(?:[^'";\n]*?\s+from\s+)?(['"])([^'"]+)\1/gu,
    /\b(?:import|require)\s*\(\s*(['"])([^'"]+)\1\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[2];
      if (specifier.startsWith('node:')) continue;
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
        problems.push(`${label}: external or bare dependency "${specifier}".`);
      } else if (!fs.existsSync(path.resolve(path.dirname(file), specifier.split(/[?#]/u)[0]))) {
        problems.push(`${label}: missing local module "${specifier}".`);
      }
    }
  }
}
for (const file of files.filter(item => /\.(?:html|css)$/u.test(item))) {
  const source = fs.readFileSync(file, 'utf8');
  if (/<(?:script|link)\b[^>]*(?:src|href)\s*=\s*['"](?:https?:)?\/\//iu.test(source)
    || /@import\s+(?:url\()?\s*['"]?(?:https?:)?\/\//iu.test(source)) {
    problems.push(`${path.relative(root, file)}: external script or stylesheet dependency.`);
  }
}
if (problems.length) {
  console.error(problems.map(problem => `FAIL ${problem}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Source checks passed: ${jsFiles.length} JavaScript modules; no package, remote script, or stylesheet dependencies.`);
}

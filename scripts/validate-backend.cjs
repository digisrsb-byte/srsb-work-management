const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const backendRoot = path.join(root, 'apps', 'backend', 'src');

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
  return files;
}

let failed = false;
for (const filePath of walk(backendRoot)) {
  const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    console.error(`\nSyntax error: ${path.relative(root, filePath)}`);
    console.error(result.stderr || result.stdout);
  }
}

if (failed) process.exit(1);
console.log('Backend JavaScript syntax: PASS');

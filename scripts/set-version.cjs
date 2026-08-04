const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const version = String(process.argv[2] || '').trim().replace(/^v/i, '');

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/set-version.cjs 1.1.1');
  process.exit(1);
}

const packageFiles = [
  'package.json',
  'apps/backend/package.json',
  'apps/frontend/package.json',
  'apps/desktop/package.json'
];

for (const relativePath of packageFiles) {
  const filePath = path.join(root, relativePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  data.version = version;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  console.log(`Updated ${relativePath} -> ${version}`);
}

const lockPath = path.join(root, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;

  const workspaceNames = {
    'apps/backend': 'srsb-hrms-api',
    'apps/frontend': 'srsb-hrms-ui',
    'apps/desktop': 'srsb-hrms-desktop'
  };

  for (const [workspacePath, packageName] of Object.entries(workspaceNames)) {
    if (lock.packages?.[workspacePath]) {
      lock.packages[workspacePath].version = version;
    }
    if (lock.packages?.[`node_modules/${packageName}`]) {
      lock.packages[`node_modules/${packageName}`].version = version;
    }
  }

  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  console.log(`Updated package-lock.json -> ${version}`);
}

console.log(`\nVersion ${version} is ready.`);

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const input = process.argv[2];
const bumpType = input?.trim();
if (!['major', 'minor', 'patch'].includes(bumpType)) {
  throw new Error('Usage: node scripts/bump-version.mjs <major|minor|patch>');
}

const packagePath = resolve(process.cwd(), 'package.json');
const lockPath = resolve(process.cwd(), 'package-lock.json');

const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const lockJson = JSON.parse(readFileSync(lockPath, 'utf8'));

const [major, minor, patch] = packageJson.version.split('.').map((value) => Number.parseInt(value, 10));
if (![major, minor, patch].every((value) => Number.isInteger(value))) {
  throw new Error(`Invalid version: ${packageJson.version}`);
}

let next = [major, minor, patch];
if (bumpType === 'major') {
  next = [major + 1, 0, 0];
} else if (bumpType === 'minor') {
  next = [major, minor + 1, 0];
} else {
  next = [major, minor, patch + 1];
}

const nextVersion = next.join('.');

packageJson.version = nextVersion;
lockJson.version = nextVersion;
if (lockJson.packages && lockJson.packages['']) {
  lockJson.packages[''].version = nextVersion;
}

writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
writeFileSync(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`);
console.log(nextVersion);

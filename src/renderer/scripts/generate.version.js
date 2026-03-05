// ex OpenCOR web app

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Retrieve the version from the package.json file.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath));
const { version } = packageJson;

// Make sure that the dist/assets folder exists.

const distAssetsPath = path.join(__dirname, '../dist/assets');

if (!fs.existsSync(distAssetsPath)) {
  fs.mkdirSync(distAssetsPath, { recursive: true });
}

// Write the version file.

fs.writeFileSync(path.join(distAssetsPath, 'version.json'), JSON.stringify({ version }, null, 2));

// Log the generated version.

console.log(`Generated version.json with version ${version}.`);

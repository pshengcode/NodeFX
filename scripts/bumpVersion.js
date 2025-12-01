import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '../package.json');

try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const versionParts = packageJson.version.split('.').map(Number);
    
    // Increment patch version
    versionParts[2] += 1; 
    const newVersion = versionParts.join('.');

    packageJson.version = newVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

    console.log(`\x1b[32mVersion bumped to ${newVersion}\x1b[0m`);
} catch (error) {
    console.error('Failed to bump version:', error);
    process.exit(1);
}

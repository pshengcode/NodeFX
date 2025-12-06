import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '../package.json');
const appConfigPath = path.join(__dirname, '../appConfig.json');

try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const versionParts = packageJson.version.split('.').map(Number);
    
    // Increment patch version
    versionParts[2] += 1; 
    const newVersion = versionParts.join('.');

    packageJson.version = newVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

    // Update appConfig.json
    if (fs.existsSync(appConfigPath)) {
        const appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));
        appConfig.version = newVersion;
        fs.writeFileSync(appConfigPath, JSON.stringify(appConfig, null, 2) + '\n');
        console.log(`\x1b[32mUpdated appConfig.json version to ${newVersion}\x1b[0m`);
    }

    console.log(`\x1b[32mVersion bumped to ${newVersion}\x1b[0m`);
} catch (error) {
    console.error('Failed to bump version:', error);
    process.exit(1);
}

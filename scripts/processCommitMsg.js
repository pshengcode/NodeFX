import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '../package.json');
const appConfigPath = path.join(__dirname, '../appConfig.json');
const changelogPath = path.join(__dirname, '../CHANGELOG.md');
const commitMsgFile = process.argv[2];

if (!commitMsgFile) {
    process.exit(0);
}

try {
    let msg = fs.readFileSync(commitMsgFile, 'utf8');
    
    // --- 1. Version Handling ---
    const versionRegex = /\[v(\d+\.\d+\.\d+)\]/;
    const match = msg.match(versionRegex);
    let currentVersion = '0.0.0';

    if (match) {
        // Case 1: User manually specified version
        currentVersion = match[1];
        console.log(`\x1b[36mManual version detected: ${currentVersion}\x1b[0m`);

        // Sync package.json
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.version !== currentVersion) {
            packageJson.version = currentVersion;
            fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
            execSync(`git add "${packageJsonPath}"`);
        }
        // Sync appConfig.json
        if (fs.existsSync(appConfigPath)) {
            const appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));
            if (appConfig.version !== currentVersion) {
                appConfig.version = currentVersion;
                fs.writeFileSync(appConfigPath, JSON.stringify(appConfig, null, 2) + '\n');
                execSync(`git add "${appConfigPath}"`);
            }
        }
    } else {
        // Case 2: Use existing version (bumped by pre-commit)
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        currentVersion = packageJson.version;

        // Append version to commit message if missing
        if (!msg.includes(`[v${currentVersion}]`)) {
            const lines = msg.split('\n');
            if (lines.length > 0 && !lines[0].startsWith('#')) {
                 lines[0] = `${lines[0].trim()} [v${currentVersion}]`;
                 msg = lines.join('\n'); // Update local msg var
                 fs.writeFileSync(commitMsgFile, msg);
            }
        }
    }

    // --- 2. Changelog Update ---
    // Extract clean message (remove comments and empty lines)
    const cleanLines = msg.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
    
    const commitContent = cleanLines.length > 0 ? cleanLines.join('\n') : "Version Update (See commit details)";

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];
    
    const entry = `## [${currentVersion}] - ${dateStr} ${timeStr}\n\n${commitContent}\n\n---\n\n`;

    let currentChangelog = '';
    if (fs.existsSync(changelogPath)) {
        currentChangelog = fs.readFileSync(changelogPath, 'utf8');
    }
    
    // Avoid duplicate entries if script runs multiple times (e.g. amend)
    // Simple check: if the top of the file already has this version and date? 
    // It's hard to be perfect, but let's just prepend.
    
    fs.writeFileSync(changelogPath, entry + currentChangelog);
    execSync(`git add "${changelogPath}"`);
    console.log(`\x1b[32mUpdated CHANGELOG.md and staged.\x1b[0m`);

} catch (error) {
    console.error('Failed to process commit message:', error);
}

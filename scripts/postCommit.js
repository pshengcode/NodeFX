import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '../package.json');
const appConfigPath = path.join(__dirname, '../appConfig.json');
const changelogPath = path.join(__dirname, '../CHANGELOG.md');

if (process.env.SKIP_POST_COMMIT) {
    process.exit(0);
}

try {
    // 1. Get the last commit message
    const msg = execSync('git log -1 --pretty=%B').toString().trim();
    
    // 2. Extract Version
    const versionRegex = /\[v(\d+\.\d+\.\d+)\]/;
    const match = msg.match(versionRegex);
    
    if (!match) {
        console.log('No version tag [vX.X.X] found in commit message. Skipping post-commit updates.');
        process.exit(0);
    }

    const currentVersion = match[1];
    let filesChanged = false;

    // 3. Sync package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (packageJson.version !== currentVersion) {
        packageJson.version = currentVersion;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
        console.log(`Updated package.json to ${currentVersion}`);
        filesChanged = true;
    }

    // 4. Sync appConfig.json
    if (fs.existsSync(appConfigPath)) {
        const appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));
        if (appConfig.version !== currentVersion) {
            appConfig.version = currentVersion;
            fs.writeFileSync(appConfigPath, JSON.stringify(appConfig, null, 2) + '\n');
            console.log(`Updated appConfig.json to ${currentVersion}`);
            filesChanged = true;
        }
    }

    // 5. Update Changelog
    // Check if entry already exists to avoid loop/duplication
    let currentChangelog = '';
    if (fs.existsSync(changelogPath)) {
        currentChangelog = fs.readFileSync(changelogPath, 'utf8');
    }

    // Construct the entry header to check for existence
    // Note: We can't check the exact time, but we can check the version and date
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const headerPrefix = `## [${currentVersion}] - ${dateStr}`;

    if (!currentChangelog.includes(headerPrefix)) {
        // Remove [content] blocks, even if they span multiple lines
        // We must process the full message string, not line by line
        const cleanMsg = msg.replace(/\[[\s\S]*?\]/g, '');
        
        const cleanLines = cleanMsg.split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('#'));
        
        if (cleanLines.length > 0) {
            const commitContent = cleanLines.join('\n');
            const entry = `## [${currentVersion}] - ${dateStr}\n\n${commitContent}\n\n`;
            
            fs.writeFileSync(changelogPath, entry + currentChangelog);
            console.log(`Updated CHANGELOG.md`);
            filesChanged = true;
        } else {
            console.log('Commit message empty after filtering, skipping CHANGELOG update.');
        }
    }

    // 6. Amend Commit if needed
    if (filesChanged) {
        console.log('Amending commit with updated files...');
        execSync(`git add "${packageJsonPath}" "${appConfigPath}" "${changelogPath}"`);
        // --no-verify to avoid triggering post-commit again? 
        // No, post-commit is triggered after commit. 
        // But --no-verify skips pre-commit and commit-msg. It does NOT skip post-commit.
        // However, since we check if files need updating above, the next run will find filesChanged = false and stop.
        // To be safe, we pass SKIP_POST_COMMIT env var to prevent recursion.
        execSync('git commit --amend --no-edit', { 
            env: { ...process.env, SKIP_POST_COMMIT: 'true' },
            stdio: 'inherit' 
        });
        console.log('Commit amended successfully.');
    }

} catch (error) {
    console.error('Failed to run post-commit script:', error);
}

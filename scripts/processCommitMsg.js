import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '../package.json');
const appConfigPath = path.join(__dirname, '../appConfig.json');
const commitMsgFile = process.argv[2];

if (!commitMsgFile) {
    process.exit(0);
}

try {
    let msg = fs.readFileSync(commitMsgFile, 'utf8');
    
    const versionRegex = /\[v(\d+\.\d+\.\d+)\]/;
    const match = msg.match(versionRegex);
    
    let newVersion;
    let shouldUpdateFile = false;

    if (match) {
        // Case 1: Manual version in message
        console.log(`\x1b[36mManual version detected in message: ${match[1]}\x1b[0m`);
        newVersion = match[1];
        shouldUpdateFile = true;
    } else {
        // Check if package.json is already staged (user modified it)
        let isStaged = false;
        try {
            // Check if package.json is in the staged files
            const stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf8' });
            if (stagedFiles.split('\n').some(f => f.trim() === 'package.json')) {
                isStaged = true;
            }
        } catch (e) {
            // ignore git errors
        }

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        if (isStaged) {
            // Case 2: User modified package.json manually
            newVersion = packageJson.version;
            console.log(`\x1b[36mUser modified package.json detected. Using version: ${newVersion}\x1b[0m`);
            shouldUpdateFile = false; // Already updated by user
        } else {
            // Case 3: Auto-bump
            const versionParts = packageJson.version.split('.').map(Number);
            versionParts[2] += 1;
            newVersion = versionParts.join('.');
            console.log(`\x1b[36mAuto-bumping version to: ${newVersion}\x1b[0m`);
            shouldUpdateFile = true;
        }

        // Append version to commit message subject line
        const lines = msg.split('\n');
        // Find first non-comment line
        const subjectLineIndex = lines.findIndex(l => l.trim() && !l.startsWith('#'));
        
        if (subjectLineIndex !== -1) {
             lines[subjectLineIndex] = `${lines[subjectLineIndex].trim()} [v${newVersion}]`;
             msg = lines.join('\n');
             fs.writeFileSync(commitMsgFile, msg);
        }
    }

    if (shouldUpdateFile) {
        // Update package.json
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        // Only write if different to avoid unnecessary IO/git add if logic is flawed
        if (packageJson.version !== newVersion) {
            packageJson.version = newVersion;
            fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
            execSync(`git add "${packageJsonPath}"`);
        }

        // Update appConfig.json
        if (fs.existsSync(appConfigPath)) {
            const appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));
            if (appConfig.version !== newVersion) {
                appConfig.version = newVersion;
                fs.writeFileSync(appConfigPath, JSON.stringify(appConfig, null, 2) + '\n');
                execSync(`git add "${appConfigPath}"`);
            }
        }
    }

} catch (error) {
    console.error('Failed to process commit message:', error);
    // Don't fail the commit, just log error
}

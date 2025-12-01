import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '../package.json');
const commitMsgFile = process.argv[2];

if (!commitMsgFile) {
    process.exit(0);
}

try {
    let msg = fs.readFileSync(commitMsgFile, 'utf8');
    const versionRegex = /\[v(\d+\.\d+\.\d+)\]/;
    const match = msg.match(versionRegex);

    if (match) {
        // Case 1: User manually specified version in log (e.g. "fix [v2.0.0]")
        const manualVersion = match[1];
        console.log(`\x1b[36mManual version detected in commit message: ${manualVersion}\x1b[0m`);

        // Update package.json to match
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.version !== manualVersion) {
            packageJson.version = manualVersion;
            fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
            
            // Stage the file again so it's included in the commit
            try {
                execSync(`git add "${packageJsonPath}"`);
                console.log(`\x1b[32mUpdated package.json to ${manualVersion} and staged.\x1b[0m`);
            } catch (e) {
                console.error('Failed to stage package.json:', e);
            }
        }
    } else {
        // Case 2: No version in log, append the current (auto-bumped) version
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const version = packageJson.version;

        // Avoid appending if already present (e.g. amend)
        if (!msg.includes(`[v${version}]`)) {
            const lines = msg.split('\n');
            if (lines.length > 0) {
                 // Append to first line if not a comment
                 if (!lines[0].startsWith('#')) {
                     lines[0] = `${lines[0].trim()} [v${version}]`;
                     fs.writeFileSync(commitMsgFile, lines.join('\n'));
                 }
            }
        }
    }
} catch (error) {
    console.error('Failed to process commit message:', error);
}

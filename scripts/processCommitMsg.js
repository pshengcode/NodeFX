import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

    if (!match) {
        // No version specified in message, append current version from package.json
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const currentVersion = packageJson.version;

        // Append version to commit message subject line
        const lines = msg.split('\n');
        // Find first non-comment line
        const subjectLineIndex = lines.findIndex(l => l.trim() && !l.startsWith('#'));
        
        if (subjectLineIndex !== -1) {
             lines[subjectLineIndex] = `${lines[subjectLineIndex].trim()} [v${currentVersion}]`;
             msg = lines.join('\n');
             fs.writeFileSync(commitMsgFile, msg);
             console.log(`\x1b[36mAppended version [v${currentVersion}] to commit message.\x1b[0m`);
        }
    } else {
        console.log(`\x1b[36mManual version detected in message: ${match[1]}\x1b[0m`);
    }

} catch (error) {
    console.error('Failed to process commit message:', error);
}

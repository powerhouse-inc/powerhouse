import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const studioDirname = fileURLToPath(new URL('.', import.meta.url));
const appPath = join(studioDirname, '..');

export function backupIndexHtml(restore = false) {
    const filePath = join(appPath, 'index.html');
    const backupPath = join(appPath, 'index.html.bak');

    const paths = restore ? [backupPath, filePath] : [filePath, backupPath];

    if (fs.existsSync(paths[0])) {
        fs.copyFileSync(paths[0], paths[1]);
    }
}

export function removeBase64EnvValues() {
    backupIndexHtml();

    const filePath = join(appPath, 'index.html');

    // Read the HTML file
    fs.readFile(filePath, 'utf-8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return;
        }

        // Use regex to replace the dynamic Base64 values with empty strings
        const modifiedData = data
            .replace(
                /"LOCAL_DOCUMENT_MODELS":\s*".*?",/,
                `"LOCAL_DOCUMENT_MODELS": "",`,
            )
            .replace(
                /"LOCAL_DOCUMENT_EDITORS":\s*".*?"/,
                `"LOCAL_DOCUMENT_EDITORS": ""`,
            );

        // Write the modified content back to the file
        fs.writeFile(filePath, modifiedData, 'utf-8', err => {
            if (err) {
                console.error('Error writing file:', err);
                return;
            }
        });
    });
}

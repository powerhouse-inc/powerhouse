const fs = require('fs');
const path = require('path');

function copyIcons() {
    try {
        const srcPath = path.join(
            __dirname,
            '../node_modules/@powerhousedao/design-system/dist/icons.svg',
        );
        const destPath = path.join(__dirname, '../public/icons.svg');

        if (!fs.existsSync(srcPath)) {
            console.log(
                'Not copying icons because install is inside another package',
            );
            return;
        }

        console.log('🤖 Copying icons.svg to public folder...');

        fs.copyFileSync(srcPath, destPath);

        console.log('✅ Copying icons.svg to public folder... Done!');
    } catch (error) {
        console.log(
            'Not copying icons because install is inside another package',
        );
        return;
    }
}

copyIcons();
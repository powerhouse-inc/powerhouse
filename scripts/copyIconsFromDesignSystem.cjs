const fs = require('fs');
const path = require('path');

if (process.env.INIT_CWD !== process.cwd())
    process.exit()

console.log('🤖 Copying icons.svg to public folder...');

fs.copyFileSync(
    path.join(
        __dirname,
        '../node_modules/@powerhousedao/design-system/dist/icons.svg',
    ),
    path.join(__dirname, '../public/icons.svg'),
);

console.log('✅ Copying icons.svg to public folder... Done!');

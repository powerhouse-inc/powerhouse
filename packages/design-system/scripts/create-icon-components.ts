import camelCase from 'camelcase';
import * as fs from 'fs';
import * as path from 'path';

const iconsDir = path.join('public/icons');
const outputFilePath = path.join('src/assets/icon-components.tsx');

const toPascalCase = (filename: string): string => {
    return camelCase(filename.replace('.svg', ''), { pascalCase: true });
};

fs.readdir(iconsDir, (err, files) => {
    if (err) {
        console.error('Error reading the icons directory:', err);
        return;
    }

    const svgFiles = files.filter(file => file.endsWith('.svg'));

    if (svgFiles.length === 0) {
        console.log('No SVG files found in the icons directory.');
        return;
    }

    let outputContent = '';

    outputContent += `import type { ComponentPropsWithoutRef } from 'react';\n`;
    outputContent += `type Props = ComponentPropsWithoutRef<'svg'>;\n\n`;

    svgFiles.forEach(file => {
        const filePath = path.join(iconsDir, file);
        const componentName = toPascalCase(file);
        const svgData = fs.readFileSync(filePath, 'utf8');
        const svgDataWithProps = svgData.replace('<svg', '<svg {...props}');
        outputContent += `export function ${componentName}(props: Props) {\n`;
        outputContent += `    return (\n${svgDataWithProps}\n    );\n`;
        outputContent += `}\n\n`;
    });

    const exportObject = svgFiles
        .map(file => toPascalCase(file))
        .join(',\n    ');
    outputContent += `export const iconComponents = {\n    ${exportObject}\n};\n\n`;

    fs.writeFileSync(outputFilePath, outputContent, 'utf8');
    console.log(`Generated icon components file: ${outputFilePath}`);
});

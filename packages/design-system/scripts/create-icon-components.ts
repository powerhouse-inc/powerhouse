import camelCase from "camelcase";
import {
  existsSync,
  mkdirSync,
  readdir,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const iconsDir = join("public/icons");
const outputDirPath = join("src/assets/icon-components");

const toPascalCase = (filename: string): string => {
  return camelCase(filename.replace(".svg", ""), { pascalCase: true });
};

if (!existsSync(outputDirPath)) {
  mkdirSync(outputDirPath);
}

readdir(iconsDir, (err, files) => {
  if (err) {
    console.error("Error reading the icons directory:", err);
    return;
  }

  const svgFiles = files.filter((file) => file.endsWith(".svg"));

  if (svgFiles.length === 0) {
    console.log("No SVG files found in the icons directory.");
    return;
  }

  const iconNames: string[] = [];

  svgFiles.forEach((file) => {
    const filePath = join(iconsDir, file);
    const componentName = toPascalCase(file);
    const svgData = readFileSync(filePath, "utf8");
    const svgDataWithProps = svgData
      .replace("<svg", "<svg {...props}")
      // turn props into camelCase
      .replace(
        /([a-z-]+)="([^"]*)"/g,
        (_, attrName: string, attrValue: string) => {
          return `${camelCase(attrName)}="${attrValue}"`;
        },
      );
    let iconContent = 'import type { Props } from "./types";\n';
    iconContent += `export default function ${componentName}(props: Props) {\n`;
    iconContent += `  return (\n${svgDataWithProps}\n  );\n`;
    iconContent += `}\n\n`;
    writeFileSync(
      join(outputDirPath, `${componentName}.tsx`),
      iconContent,
      "utf8",
    );
    iconNames.push(componentName);
  });

  let typesContent =
    "import type { ComponentPropsWithoutRef } from 'react';\n\n";
  typesContent += "export type Props = ComponentPropsWithoutRef<'svg'>;\n\n";
  typesContent += `export const iconNames = ${JSON.stringify(iconNames, null, 2)} as const;\n\n`;
  typesContent += `export type IconName = (typeof iconNames)[number];\n`;
  writeFileSync(join(outputDirPath, "types.ts"), typesContent);

  console.log(`Generated icon components at: ${outputDirPath}`);
});

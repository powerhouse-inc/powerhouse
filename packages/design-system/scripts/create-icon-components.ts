import prettier from "@prettier/sync";
import camelCase from "camelcase";
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdir,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const iconsDir = join("public/icons");
const outputDirPath = join("src/powerhouse/components/icon-components");

const toPascalCase = (filename: string): string => {
  return camelCase(filename.replace(".svg", ""), { pascalCase: true });
};

// Check if there are changes in the icons directory
const hasChanges = () => {
  try {
    const output = execSync(`git status --porcelain ${iconsDir}`).toString();
    return output.trim().length > 0;
  } catch (error) {
    console.error("Error checking git status:", error);
    return false;
  }
};

// if (!hasChanges()) {
//   console.log(
//     "No changes detected in the icons directory. Skipping generation.",
//   );
//   process.exit(0);
// }

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
      .replace(
        /([a-z-]+)="([^"]*)"/g,
        (_, attrName: string, attrValue: string) => {
          return `${camelCase(attrName)}="${attrValue}"`;
        },
      );
    let iconContent = 'import type { Props } from "./index.js";\n';
    iconContent += `export default function ${componentName}(props: Props) {\n`;
    iconContent += `  return (\n${svgDataWithProps}\n  );\n`;
    iconContent += `}\n\n`;
    const formattedIconContent = prettier.format(iconContent, {
      parser: "typescript",
    });
    writeFileSync(
      join(outputDirPath, `${componentName}.tsx`),
      formattedIconContent,
      "utf8",
    );
    iconNames.push(componentName);
  });

  let indexContent =
    "import type { ComponentPropsWithoutRef } from 'react';\n\n";
  for (const iconName of iconNames) {
    indexContent += `import ${iconName} from "./${iconName}.js";\n`;
  }
  indexContent += `export type Props = ComponentPropsWithoutRef<'svg'>;\n\n`;
  indexContent += `export const iconNames = ${JSON.stringify(iconNames, null, 2)} as const;\n\n`;
  indexContent += `export type IconName = (typeof iconNames)[number];\n`;
  indexContent += `export const iconComponents: Record<IconName, (props: Props) => React.JSX.Element> = {
    ${iconNames.map((name) => name).join(",\n    ")}
  } as const;\n`;
  const formattedTypesContent = prettier.format(indexContent, {
    parser: "typescript",
  });
  writeFileSync(join(outputDirPath, "index.ts"), formattedTypesContent);

  console.log(`Generated icon components at: ${outputDirPath}`);
});

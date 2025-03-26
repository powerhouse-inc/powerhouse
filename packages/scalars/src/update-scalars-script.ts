import * as fs from "fs/promises";
import * as path from "path";

async function updateScalarFile(filePath: string) {
  try {
    // Read the file content
    let content = await fs.readFile(filePath, "utf-8");

    // Add BasePHScalar import if not present
    if (!content.includes("BasePHScalar")) {
      content = content.replace(
        /import {([^}]+)} from "graphql";/,
        'import {$1} from "graphql";\nimport { type BasePHScalar } from "./types.js";',
      );
    }

    // Extract type name from GraphQLScalarTypeConfig generic
    const typeConfigMatch = /GraphQLScalarTypeConfig<(\w+),/.exec(content);
    if (!typeConfigMatch) {
      throw new Error("Could not find GraphQLScalarTypeConfig type parameter");
    }
    const typeName = typeConfigMatch[1];

    // Remove ScalarType definition if it exists
    content = content.replace(
      /export type ScalarType = {[\s\S]*?};(\n|\r\n)/,
      "",
    );

    // Add the BasePHScalar export if not present
    if (!content.includes(`${typeName}Scalar:`)) {
      // Remove any trailing newlines
      content = content.trimEnd();

      // Add the new export
      content += `\n\nexport const ${typeName}Scalar: BasePHScalar<${typeName}> = {
  type,
  typedef,
  schema,
  stringSchema,
  config,
  scalar,
} as const;\n`;
    }

    // Write the updated content back to the file
    await fs.writeFile(filePath, content, "utf-8");
    console.log(`Updated ${filePath}`);
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

async function processDirectory(dirPath: string) {
  try {
    const files = await fs.readdir(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        await processDirectory(filePath);
      } else if (file.endsWith(".ts") && !file.endsWith(".test.ts")) {
        await updateScalarFile(filePath);
      }
    }
  } catch (error) {
    console.error("Error processing directory:", error);
  }
}

// Use current directory
processDirectory(".")
  .then(() => console.log("Finished processing files"))
  .catch(console.error);

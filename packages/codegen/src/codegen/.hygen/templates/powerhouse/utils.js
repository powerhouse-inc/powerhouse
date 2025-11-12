const {
  pascalCase,
  paramCase,
  capitalCase,
  camelCase,
} = require("change-case");
const { readdirSync, readFileSync, existsSync } = require("fs");
const { join } = require("path");

function getModuleExports(dirPath, matcher, newEntry) {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const moduleExports = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    try {
      const modulePath = join(dirPath, entry.name, "module.ts");
      const content = readFileSync(modulePath, "utf8");

      const match = content.match(matcher);

      if (match) {
        const result = {
          dirPath,
          modulePath,
          paramCaseName: entry.name,
          pascalCaseName: match[1],
        };
        console.log("result", result);
        moduleExports.push(result);
      }
    } catch (_) {
      continue;
    }
  }

  if (
    !moduleExports.find((me) => me.paramCaseName === newEntry.paramCaseName)
  ) {
    moduleExports.push(newEntry);
  }

  return moduleExports;
}

module.exports = {
  getModuleExports,
};

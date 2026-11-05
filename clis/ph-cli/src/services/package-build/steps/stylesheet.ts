import {
  localPackageNames,
  packageStyleEntry,
  packageStylesheet,
} from "@powerhousedao/shared/clis/package-style";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { resolveCommand } from "package-manager-detector";
import { BuildRefusal } from "../pipeline/steps.js";
import type { StandardBuildStep } from "./context.js";

// A path for `@source`, relative to the project, with forward slashes.
function sourcePath(projectRoot: string, path: string) {
  return `./${relative(projectRoot, resolve(projectRoot, path)).replaceAll("\\", "/")}`;
}

// The classes the browser build uses, and the package's tokens and rules, against
// Connect's theme: the Connect that loads it has Tailwind's reset and Connect's classes.
export const stylesheetStep: StandardBuildStep = {
  id: "stylesheet",
  run: ({ agent, projectRoot, session }) => {
    const stage = session.stage();
    const command = resolveCommand(agent, "execute-local", [
      "tailwindcss",
      "--input",
      "-",
      "--minify",
    ]);
    if (command === null) {
      throw new BuildRefusal(
        "You need to have tailwindcss installed to use the `build` command.",
      );
    }
    const stylePath = join(projectRoot, "style.css");
    const style = existsSync(stylePath)
      ? readFileSync(stylePath, "utf-8")
      : undefined;
    const compiled = execSync(`${command.command} ${command.args.join(" ")}`, {
      cwd: projectRoot,
      input: packageStyleEntry(style, {
        browserDir: sourcePath(projectRoot, join(stage, "browser")),
        localPackages: localPackageNames(projectRoot),
      }),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "inherit"],
      // A package that imports large vendor CSS outgrows the 1 MB default.
      maxBuffer: 64 * 1024 * 1024,
    });
    // `ph build` with another out-dir (the switchboard runner's) leaves no
    // staged dist/, so the stylesheet goes to dist/ directly, as it always has.
    const distDir = session.writesPackageDist
      ? stage
      : join(projectRoot, "dist");
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, "style.css"), packageStylesheet(compiled));
    return Promise.resolve();
  },
};

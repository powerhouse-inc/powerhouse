import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { materializeFixturePackage } from "../../../packages/document-model/test/tooling/loader-contract.js";
import { runBuild } from "../src/services/build.js";

describe("building through a symlinked package root", () => {
  it.each([
    "relative",
    "absolute source root",
    "absolute declarations",
    "absolute compiler output",
    "absolute output",
  ])(
    "publishes identical definitions, bundles and declarations with %s paths",
    async (layout) => {
      const fixture = materializeFixturePackage("control");
      const temporary = mkdtempSync(join(tmpdir(), "ph-build-symlink-"));
      const alias = join(temporary, "package");
      symlinkSync(
        fixture.root,
        alias,
        process.platform === "win32" ? "junction" : "dir",
      );
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      try {
        writeFileSync(
          join(fixture.root, "index.ts"),
          'export { invoiceFamily } from "./src/invoice.js";\n',
        );
        writeFileSync(
          join(fixture.root, "package.json"),
          JSON.stringify({
            name: "ph-fixture-control",
            version: "0.0.0",
            type: "module",
            files: ["dist"],
            exports: {
              ".": {
                browser: "./dist/browser/index.js",
                import: "./dist/node/index.mjs",
              },
            },
          }),
        );
        const configure = (root: string) => {
          writeFileSync(
            join(fixture.root, "tsconfig.json"),
            JSON.stringify({
              compilerOptions: {
                rootDir: ".",
                module: "nodenext",
                moduleResolution: "nodenext",
                target: "esnext",
                ...(layout === "absolute source root" && { sourceRoot: root }),
                declaration: true,
                declarationMap: true,
                ...(layout === "absolute compiler output"
                  ? { outDir: join(root, "dist", "types") }
                  : {
                      declarationDir:
                        layout === "absolute declarations"
                          ? join(root, "dist", "types")
                          : "./dist/types",
                    }),
                emitDeclarationOnly: true,
                skipLibCheck: true,
              },
              include: ["index.ts", "src/**/*.ts"],
            }),
          );
        };
        const build = async (root: string) => {
          configure(root);
          const messages: string[] = [];
          const result = await runBuild(
            {
              configFile: join(root, "powerhouse.config.json"),
              outDir:
                layout === "absolute output" ? join(root, "dist") : "dist",
              source: [],
              warningsAsErrors: false,
              noSharedDeps: false,
              ignoreTypeErrors: false,
              debug: false,
            },
            { log: (text) => messages.push(text) },
          );
          expect(
            result.exitCode,
            messages.join("") + JSON.stringify(result.report?.diagnostics),
          ).toBe(0);
          const dist = join(fixture.root, "dist");
          const artifacts = Object.fromEntries(
            readdirSync(dist, { recursive: true, encoding: "utf8" })
              .filter((file) => statSync(join(dist, file)).isFile())
              .sort()
              .map((file) => [file, readFileSync(join(dist, file), "utf8")]),
          );
          expect(artifacts).toHaveProperty("types/src/invoice.d.ts");
          expect(artifacts).toHaveProperty("types/src/invoice.d.ts.map");
          expect(artifacts).toHaveProperty("node/index.mjs");
          expect(artifacts).toHaveProperty("browser/index.js");
          return {
            result,
            artifacts,
          };
        };
        const direct = await build(fixture.root);
        rmSync(join(fixture.root, "dist"), { recursive: true, force: true });
        const linked = await build(alias);
        expect(linked).toEqual(direct);
      } finally {
        log.mockRestore();
        rmSync(temporary, { recursive: true, force: true });
        fixture.dispose();
      }
    },
    120_000,
  );
});

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ts } from "ts-morph";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dockerfileTemplate,
  oxfmtConfigTemplate,
  tsConfigTemplate,
} from "templates";
import {
  writeCIFiles,
  writeGeneratedProjectRootFiles,
} from "./generated-project-files.js";
import { withTemplateEntries } from "./merge-project-config.js";

const BANNER = "This file is auto-generated and updated by codegen";

const temporary: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTemp() {
  const dir = mkdtempSync(join(tmpdir(), "ph-root-files-"));
  temporary.push(dir);
  return dir;
}

function write(projectDir: string, path: string, contents: string) {
  const filePath = join(projectDir, path);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

const read = (projectDir: string, path: string) =>
  readFileSync(join(projectDir, path), "utf-8");

const parse = (text: string) =>
  ts.parseConfigFileTextToJson("config.json", text).config as Record<
    string,
    unknown
  >;

const ROOT_FILES = [
  "tsconfig.json",
  "index.html",
  "main.tsx",
  ".oxlintrc.json",
  ".oxfmtrc.json",
  "index.ts",
  "reactor/index.ts",
  "style.css",
  "vitest.config.ts",
];

const CI_FILES = [
  ".github/workflows/sync-and-publish.yml",
  "Dockerfile",
  "docker/nginx.conf",
  "docker/connect-entrypoint.sh",
  "docker/switchboard-entrypoint.sh",
];

describe("withTemplateEntries", () => {
  const template = `{
  "compilerOptions": {
    // the module system
    "module": "nodenext",
    "strict": true
  },
  "include": ["**/*", "gen.ts"],
  "exclude": ["dist", "node_modules"]
}
`;

  it("is the template for a project without the file", () => {
    expect(withTemplateEntries("tsconfig.json", template, undefined)).toBe(
      template,
    );
  });

  it("adds the keys the project lacks and keeps the values it set", () => {
    const merged = withTemplateEntries(
      "tsconfig.json",
      template,
      `{
  // ours
  "compilerOptions": { "strict": false, "target": "es2022" },
  "exclude": ["build"]
}
`,
      [{ keyPath: ["include"] }, { keyPath: ["exclude"] }],
    );

    expect(merged).toContain("// ours");
    expect(parse(merged ?? "")).toEqual({
      compilerOptions: { strict: false, target: "es2022", module: "nodenext" },
      exclude: ["build", "dist", "node_modules"],
      include: ["**/*", "gen.ts"],
    });
  });

  it("adds to the listed arrays only, each entry once", () => {
    const merged = withTemplateEntries(
      "tsconfig.json",
      template,
      `{
  "compilerOptions": { "module": "nodenext", "strict": true },
  "include": ["src"],
  "exclude": ["./dist/", "node_modules"]
}
`,
      [{ keyPath: ["exclude"] }],
    );

    expect(merged).toBeUndefined();
  });

  it("removes the entries earlier templates shipped", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const merged = withTemplateEntries(
      "tsconfig.json",
      template,
      `{
  "compilerOptions": { "module": "nodenext", "strict": true },
  "include": ["**/*", "gen.ts"],
  "exclude": ["dist", "./.ph/", "node_modules", ".ph"]
}
`,
      [{ keyPath: ["exclude"], dropped: [".ph"] }],
    );

    expect(parse(merged ?? "").exclude).toEqual(["dist", "node_modules"]);
  });

  it("is undefined when the project lacks nothing, or can't be read", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      withTemplateEntries("tsconfig.json", template, template, [
        { keyPath: ["include"] },
      ]),
    ).toBeUndefined();
    expect(
      withTemplateEntries("tsconfig.json", template, "{ not json"),
    ).toBeUndefined();
  });
});

describe("the root files of a project", { timeout: 30_000 }, () => {
  it("are all created in a folder that has none", async () => {
    const dir = makeTemp();

    await writeGeneratedProjectRootFiles(dir);
    await writeCIFiles(dir);

    for (const file of [...ROOT_FILES, ...CI_FILES]) {
      expect(existsSync(join(dir, file)), file).toBe(true);
    }
    expect(parse(read(dir, "tsconfig.json"))).toEqual(parse(tsConfigTemplate));
    expect(read(dir, "Dockerfile")).toBe(dockerfileTemplate);
  });

  it("are created where missing, beside the ones the project has", async () => {
    const dir = makeTemp();
    write(dir, "Dockerfile", "FROM scratch\n");

    await writeCIFiles(dir);

    expect(read(dir, "Dockerfile")).toBe("FROM scratch\n");
    for (const file of CI_FILES) {
      expect(existsSync(join(dir, file)), file).toBe(true);
    }
  });

  it("stay as the project wrote them, with a line for each that differs", async () => {
    const dir = makeTemp();
    const own: Record<string, string> = {
      "index.html": "<!doctype html>\n<title>Ours</title>\n",
      ".github/workflows/sync-and-publish.yml": "name: ours\n",
      Dockerfile: "FROM scratch\n",
      "docker/nginx.conf": "user ours;\n",
      "docker/connect-entrypoint.sh": "#!/bin/sh\necho ours\n",
      "docker/switchboard-entrypoint.sh": "#!/bin/sh\necho ours\n",
    };
    for (const [path, contents] of Object.entries(own)) {
      write(dir, path, contents);
    }
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await writeGeneratedProjectRootFiles(dir);
    await writeCIFiles(dir);

    const printed = log.mock.calls.map((call) => String(call[0]));
    for (const [path, contents] of Object.entries(own)) {
      expect(read(dir, path), path).toBe(contents);
      const lines = printed.filter((line) =>
        line.startsWith(`  kept ${path}:`),
      );
      expect(lines, path).toHaveLength(1);
      expect(lines[0]).toContain("templates/boilerplate/");
    }
  });

  it("say nothing of a file that is the current template", async () => {
    const dir = makeTemp();
    await writeGeneratedProjectRootFiles(dir);
    await writeCIFiles(dir);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await writeGeneratedProjectRootFiles(dir);
    await writeCIFiles(dir);

    const printed = log.mock.calls.map((call) => String(call[0]));
    expect(printed.filter((line) => line.startsWith("  kept "))).toEqual([]);
  });

  it("merge the JSON config files: missing keys are added, the project's values stay", async () => {
    const dir = makeTemp();
    write(
      dir,
      "tsconfig.json",
      `{
  "compilerOptions": {
    // bundler resolution, on purpose
    "module": "preserve",
    "paths": { "lib/*": ["./lib/*"] }
  },
  "exclude": ["dist", "scratch"]
}
`,
    );
    write(
      dir,
      ".oxlintrc.json",
      JSON.stringify({
        ignorePatterns: ["scratch/**"],
        rules: { "typescript/await-thenable": "off" },
      }),
    );
    write(dir, ".oxfmtrc.json", JSON.stringify({ printWidth: 100 }));

    await writeGeneratedProjectRootFiles(dir);

    const tsconfig = parse(read(dir, "tsconfig.json"));
    const options = tsconfig.compilerOptions as Record<string, unknown>;
    expect(options.module).toBe("preserve");
    expect(options.strict).toBe(true);
    expect(options.paths).toMatchObject({
      "lib/*": ["./lib/*"],
      editors: ["./editors/index.ts"],
    });
    expect(read(dir, "tsconfig.json")).toContain(
      "// bundler resolution, on purpose",
    );
    expect((tsconfig.exclude as string[]).slice(0, 2)).toEqual([
      "dist",
      "scratch",
    ]);
    expect(tsconfig.exclude).toContain("hosts/desktop/tauri-shell");
    expect(tsconfig.include).toContain(".ph/connect-routes.gen.ts");

    const oxlint = parse(read(dir, ".oxlintrc.json"));
    const rules = oxlint.rules as Record<string, unknown>;
    expect(rules["typescript/await-thenable"]).toBe("off");
    expect(rules["typescript/ban-ts-comment"]).toBe("error");
    expect(oxlint.ignorePatterns).toContain("scratch/**");
    expect(oxlint.ignorePatterns).toContain("**/gen/**");
    expect(oxlint).toHaveProperty("plugins");

    const oxfmt = parse(read(dir, ".oxfmtrc.json"));
    expect(oxfmt.printWidth).toBe(100);
    expect(oxfmt.ignorePatterns).toEqual(
      parse(oxfmtConfigTemplate).ignorePatterns,
    );

    // A second run finds nothing to add.
    const after = ["tsconfig.json", ".oxlintrc.json", ".oxfmtrc.json"].map(
      (file) => read(dir, file),
    );
    await writeGeneratedProjectRootFiles(dir);
    expect(
      ["tsconfig.json", ".oxlintrc.json", ".oxfmtrc.json"].map((file) =>
        read(dir, file),
      ),
    ).toEqual(after);
  });

  it("refresh the entry files codegen owns, and keep one the project took over", async () => {
    const dir = makeTemp();
    write(dir, "main.tsx", `/** ${BANNER} */\nexport const old = true;\n`);
    const own = 'import "./telemetry.js";\nexport * from "./lib.js";\n';
    write(dir, "index.ts", own);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await writeGeneratedProjectRootFiles(dir);

    expect(read(dir, "main.tsx")).toContain("startConnect");
    expect(read(dir, "main.tsx")).not.toContain("old = true");
    expect(read(dir, "index.ts")).toBe(own);
    expect(read(dir, "reactor/index.ts")).toContain(BANNER);
    const printed = log.mock.calls.map((call) => String(call[0]));
    expect(
      printed.filter((line) => line.startsWith("  kept index.ts:")),
    ).toHaveLength(1);
  });
});

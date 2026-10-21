import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizePath } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hostStylesheetPath,
  hostStylesheetPlugin,
  withHostStylesheet,
} from "./host-stylesheet.js";

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "ph-host-style-"));
  writeFileSync(join(project, "style.css"), `@import "tailwindcss";\n`);
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

function writeHostStyle(host: string) {
  mkdirSync(join(project, "hosts", host), { recursive: true });
  const file = join(project, "hosts", host, "style.css");
  writeFileSync(file, ":root { --x: 1; }\n");
  return file;
}

const HOST_IMPORT = `@import "./hosts/connect/style.css";`;

describe("hostStylesheetPath", () => {
  it("is hosts/connect/style.css by default", () => {
    const file = join(project, "hosts/connect/style.css");
    expect(hostStylesheetPath(project)).toBe(file);
    expect(hostStylesheetPath(project, false)).toBe(file);
  });

  it("sits beside a host's own routes folder", () => {
    expect(hostStylesheetPath(project, join(project, "hosts/lab/routes"))).toBe(
      join(project, "hosts/lab/style.css"),
    );
  });
});

describe("the project's style.css", () => {
  it("imports a placeholder in dev until the host file exists", () => {
    const plugin = hostStylesheetPlugin(project, hostStylesheetPath(project));
    const cacheDir = join(project, "node_modules/.vite");
    (plugin.configResolved as (config: unknown) => void)({
      command: "serve",
      cacheDir,
    });
    const placeholder = join(cacheDir, "ph-host-stylesheet.css");
    const load = plugin.load as (id: string) => string | null;
    const id = normalizePath(join(project, "style.css"));
    expect(load(id)).toContain(
      `@import "./node_modules/.vite/ph-host-stylesheet.css";`,
    );
    const before = statSync(placeholder).mtimeMs;
    const host = writeHostStyle("connect");
    const hotUpdate = plugin.hotUpdate as (
      this: unknown,
      ctx: { file: string; modules: unknown[]; type: string },
    ) => unknown;
    const environment = { moduleGraph: { getModulesByFile: () => undefined } };
    hotUpdate.call(
      { environment },
      { file: normalizePath(host), modules: [], type: "create" },
    );
    expect(statSync(placeholder).mtimeMs).toBeGreaterThanOrEqual(before);
    expect(load(id)).toContain(HOST_IMPORT);
  });

  const stylesheet = () => join(project, "style.css");

  it("imports the host's stylesheet last, once it exists", () => {
    const host = hostStylesheetPath(project);
    expect(withHostStylesheet("a{}", stylesheet(), host)).toBe("a{}");
    writeHostStyle("connect");
    expect(withHostStylesheet("a{}", stylesheet(), host)).toBe(
      `a{}\n${HOST_IMPORT}\n`,
    );
  });

  it("is served with the host's stylesheet by its Vite id", () => {
    const plugin = hostStylesheetPlugin(project, hostStylesheetPath(project));
    const load = plugin.load as (id: string) => string | null;
    const id = `${normalizePath(stylesheet())}?direct`;
    expect(load(id)).not.toContain(HOST_IMPORT);
    writeHostStyle("connect");
    expect(load(id)).toContain(HOST_IMPORT);
    expect(load(normalizePath(join(project, "other.css")))).toBeNull();
  });

  it("takes the host stylesheet's updates", () => {
    const host = hostStylesheetPath(project);
    const plugin = hostStylesheetPlugin(project, host);
    const styleModule = { file: normalizePath(stylesheet()) };
    const environment = {
      moduleGraph: {
        getModulesByFile: (file: string) =>
          file === styleModule.file ? new Set([styleModule]) : undefined,
      },
    };
    const hotUpdate = plugin.hotUpdate as (
      this: unknown,
      ctx: { file: string; modules: unknown[]; type?: string },
    ) => unknown[] | undefined;
    expect(
      hotUpdate.call(
        { environment },
        { file: normalizePath(host), modules: [] },
      ),
    ).toEqual([styleModule]);

    expect(
      hotUpdate.call(
        { environment },
        { file: normalizePath(join(project, "a.css")), modules: [] },
      ),
    ).toBeUndefined();
  });
});

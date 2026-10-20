import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = (name: string) => readFileSync(join(root, "dist", name), "utf8");

// The real build step: `pnpm build` runs it after the bundle.
beforeAll(() => {
  execFileSync("pnpm", ["run", "build:shell"], {
    cwd: root,
    stdio: "pipe",
    // Vitest sets NODE_ENV=test, which would bundle the dev JSX runtime.
    env: { ...process.env, NODE_ENV: "production" },
    shell: process.platform === "win32",
  });
}, 120_000);

describe("the prerendered shells", () => {
  it("maps each plugin that picks a shell to it, in a manifest", () => {
    const manifest = JSON.parse(dist("shell-plugins.json")) as Record<
      string,
      string
    >;
    const entries = Object.entries(manifest);
    expect(entries.length).toBeGreaterThan(0);
    for (const [module, variant] of entries) {
      expect(module).toBeTruthy();
      // Each shell the manifest names was rendered.
      expect(["generic", "core"]).toContain(variant);
      expect(
        dist(variant === "core" ? "shell-core.html" : "shell.html"),
      ).toContain(`data-ph-shell="${variant}"`);
    }
    expect(Object.values(manifest)).toContain("generic");
  });

  it("emits Connect's chrome as the generic variant", () => {
    const body = dist("shell.html");
    expect(body.startsWith(`<div data-ph-shell="generic" inert`)).toBe(true);
    expect(body).toContain(`id="sidebar"`);
    expect(dist("shell-head.html")).toContain(
      `<style data-ph-shell="generic">`,
    );
  });

  it("emits core's header and a neutral loader as the core variant", () => {
    const body = dist("shell-core.html");
    expect(body.startsWith(`<div data-ph-shell="core" inert`)).toBe(true);
    expect(body).toContain("<header");
    // The project build fills in its app name; Connect's own is the fallback.
    expect(body).toContain(
      "<!--ph-shell:app-name-->Connect<!--/ph-shell:app-name-->",
    );
    expect(body).not.toContain("__PH_SHELL_APP_NAME__");
    expect(body).toContain(`class="ph-shell-loader`);
    expect(body).toContain("animate-spin");
    expect(body).not.toContain(`id="sidebar"`);
    expect(body).not.toContain("home-screen");
    expect(body).not.toContain("<svg");

    const head = dist("shell-core-head.html");
    expect(head).toContain(`<style data-ph-shell="core">`);
    // Both themes; the theme boot sets `.dark` before paint.
    expect(head).toMatch(/:root\{[^}]*--ph-core-fg:/);
    expect(head).toMatch(/:root\.dark\{[^}]*--ph-core-fg:/);
    expect(head).toMatch(/\.dark\{[^}]*--background:/);
    // Only the utilities its markup uses, not every class core's sources hold.
    expect(head).not.toContain("text-core-danger");
    expect(head.length).toBeLessThan(dist("shell-head.html").length);
  });

  // A dev server renders a project's shells again on each route edit, with a
  // fresh copy of the renderer in the same process.
  it("renders the same shell from a second copy of the renderer", () => {
    const shell = pathToFileURL(join(root, ".prerender", "shell.js")).href;
    const script = [
      `const first = await import(${JSON.stringify(`${shell}?first`)});`,
      `const before = await first.renderShell("generic");`,
      `await first.renderShell("core");`,
      `const second = await import(${JSON.stringify(`${shell}?second`)});`,
      `const after = await second.renderShell("generic");`,
      `console.log(JSON.stringify(after === before));`,
    ].join("\n");
    const out = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      { cwd: root, env: { ...process.env, NODE_ENV: "production" } },
    );
    expect(out.toString().trim().split("\n").at(-1)).toBe("true");
  }, 60_000);
});

// Renders docker/nginx.conf.template through docker/connect-entrypoint.sh's own
// templating step (envsubst) and checks the locations Connect's dist needs.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DOCKER = resolve(__dirname, "../../../docker");
const HAS_ENVSUBST =
  spawnSync("sh", ["-c", "command -v envsubst"]).status === 0;

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ph-nginx-template-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function render(basePath: string): string {
  const entrypoint = readFileSync(
    join(DOCKER, "connect-entrypoint.sh"),
    "utf8",
  );
  const templating = entrypoint.slice(0, entrypoint.search(/^envsubst /m));
  const envsubstLine = /^envsubst .*$/m.exec(entrypoint)![0];
  const out = join(dir, `nginx-${basePath.replace(/\W/g, "_")}.conf`);
  const script = join(dir, "render.sh");
  writeFileSync(
    script,
    templating +
      envsubstLine
        .replace(
          "/etc/nginx/nginx.conf.template",
          join(DOCKER, "nginx.conf.template"),
        )
        .replace("> /etc/nginx/nginx.conf", `> ${out}`) +
      "\n",
  );
  const res = spawnSync("sh", [script], {
    env: {
      PATH: process.env.PATH,
      PORT: "8080",
      PH_CONNECT_BASE_PATH: basePath,
    },
    encoding: "utf8",
  });
  expect(res.status, res.stderr).toBe(0);
  return readFileSync(out, "utf8");
}

describe.skipIf(!HAS_ENVSUBST)("nginx.conf.template", () => {
  it("serves the prebuilt dirs under a subpath base", () => {
    const conf = render("/connect/");
    for (const d of ["__vendor__", "__react__", "__reactor_worker__"]) {
      expect(conf).toContain(`location ^~ /connect/${d}/ {`);
      expect(conf).toContain(`alias /var/www/html/project/${d}/;`);
    }
    expect(conf).toContain(
      "location = /connect { return 301 /connect/$is_args$args; }",
    );
    expect(conf).toContain("location = /connect/manifest.webmanifest {");
    expect(conf).toContain("default_type application/manifest+json;");
    expect(conf).toContain(
      "add_header Cache-Control $ph_worker_cache_control;",
    );
  });

  it("renders the same locations at the root base, without a redirect", () => {
    const conf = render("/");
    expect(conf).toContain("location ^~ /__vendor__/ {");
    expect(conf).toContain("location ^~ /__react__/ {");
    expect(conf).toContain("location ^~ /__reactor_worker__/ {");
    expect(conf).not.toContain("return 301");
    expect(conf).not.toMatch(/\$\{PH_CONNECT_/);
  });

  it("marks only content-addressed files immutable", () => {
    const conf = render("/connect/");
    const block = (head: string) => {
      const start = conf.indexOf(head);
      return conf.slice(start, conf.indexOf("}", start));
    };
    expect(block("location ^~ /connect/__vendor__/")).toContain("immutable");
    expect(block("location ^~ /connect/__react__/")).toContain("immutable");
    expect(block("location = /connect/__vendor__/shared-deps.js")).toContain(
      '"no-cache"',
    );
    expect(conf).toMatch(
      /map \$arg_v \$ph_worker_cache_control \{\s+""\s+"no-cache";/,
    );
  });
});

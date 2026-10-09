// Where a bundle's declared dependencies install from, with a real npm and a
// local registry: a package's piece uses its registry, an npm piece the host's.
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
  ensurePieceBundle,
  setPublicPieceSources,
} from "../../../src/pieces/activepieces/fetch.js";
import { setPieceRegistryUrl } from "../../../src/pieces/activepieces/registry-source.js";

// One ustar file entry, padded to the 512-byte block size.
function tarEntry(name: string, body: string): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "utf8");
  header.write(body.length.toString(8).padStart(11, "0") + "\0", 124, 12);
  header.write("0", 156, 1, "utf8");
  header.write("ustar\0" + "00", 257, 8, "utf8");
  header.write("        ", 148, 8, "utf8");
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf8");
  const content = Buffer.alloc(Math.ceil(body.length / 512) * 512);
  content.write(body, 0, "utf8");
  return Buffer.concat([header, content]);
}

function tarball(files: Record<string, string>): Buffer {
  const entries = Object.entries(files).map(([name, body]) =>
    tarEntry(`package/${name}`, body),
  );
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]));
}

const DEP = "native-a";
const DEP_VERSION = "3.1.4";
const VERSION = "1.0.0";
const PACKAGE_PIECE = "@fixture/piece-native";
const NPM_PIECE = "@fixture/piece-npm";
const PACKAGE_BASE = "/registry/-/cdn/fixture@1.0.0/node/pieces/native/";

// What ph build writes beside a piece that keeps a native package external.
const pieceFiles = (name: string): Record<string, string> => ({
  "package.json": JSON.stringify({
    name,
    version: VERSION,
    type: "module",
    main: "index.mjs",
    dependencies: { [DEP]: DEP_VERSION },
  }),
  "index.mjs": `export { load } from "${DEP}";\n`,
});

const depTarball = tarball({
  "package.json": JSON.stringify({
    name: DEP,
    version: DEP_VERSION,
    main: "index.js",
  }),
  "index.js": "exports.load = () => 1;\n",
});

let origin: string;
let requests: string[];
let server: http.Server;
let cacheDir: string;
const saved: Record<string, string | undefined> = {};

// /registry and /npm both serve the dependency, so the log says which npm asked.
function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const pathname = new URL(req.url ?? "/", "http://fixture").pathname;
  requests.push(pathname);
  const send = (body: Buffer | string, type = "application/json") => {
    res.writeHead(200, { "content-type": type });
    res.end(body);
  };
  if (pathname.startsWith(PACKAGE_BASE)) {
    const files = pieceFiles(PACKAGE_PIECE);
    const name = pathname.slice(PACKAGE_BASE.length);
    if (name in files) return send(files[name], "text/plain");
  }
  if (
    pathname === `/registry/-/pieces/bundled/${PACKAGE_PIECE}/${VERSION}.tgz`
  ) {
    return send(tarball(pieceFiles(PACKAGE_PIECE)), "application/gzip");
  }
  if (pathname === `/npm/${NPM_PIECE}/-/piece-npm-${VERSION}.tgz`) {
    return send(tarball(pieceFiles(NPM_PIECE)), "application/gzip");
  }
  for (const prefix of ["/registry", "/npm"]) {
    const tarballPath = `${prefix}/${DEP}/-/${DEP}-${DEP_VERSION}.tgz`;
    if (pathname === `${prefix}/${DEP}`) {
      return send(
        JSON.stringify({
          name: DEP,
          "dist-tags": { latest: DEP_VERSION },
          versions: {
            [DEP_VERSION]: {
              name: DEP,
              version: DEP_VERSION,
              dist: { tarball: `${origin}${tarballPath}` },
            },
          },
        }),
      );
    }
    if (pathname === tarballPath) return send(depTarball, "application/gzip");
  }
  res.writeHead(404);
  res.end();
}

beforeAll(async () => {
  server = http.createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setPieceRegistryUrl(`${origin}/registry`);
  setPublicPieceSources({
    cdnUrl: `${origin}/cdn`,
    npmRegistryUrl: `${origin}/npm`,
  });
  // The host's npm config, which the install inherits.
  for (const key of ["npm_config_registry", "npm_config_cache"]) {
    saved[key] = process.env[key];
  }
  process.env.npm_config_registry = `${origin}/npm/`;
});

afterAll(async () => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  setPieceRegistryUrl(undefined);
  setPublicPieceSources({
    cdnUrl: "http://127.0.0.1:9",
    npmRegistryUrl: "http://127.0.0.1:9",
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  requests = [];
  cacheDir = await mkdtemp(path.join(tmpdir(), "ap-install-registry-"));
  // A fresh npm cache, so every install asks a registry.
  process.env.npm_config_cache = path.join(cacheDir, "npm-cache");
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

describe("installing a bundle's declared dependencies", () => {
  it("installs a package's piece from the registry the package came from", async () => {
    // Not the registry the host fetches pieces from: the entry URL decides.
    setPieceRegistryUrl(`${origin}/other-registry`);
    try {
      const bundle = await ensurePieceBundle({
        name: PACKAGE_PIECE,
        version: VERSION,
        cacheDir,
        entryUrl: `${origin}${PACKAGE_BASE}index.mjs`,
      });

      expect(bundle.installed).toBe(true);
      expect(
        existsSync(path.join(bundle.dir, "..", "..", DEP, "package.json")),
      ).toBe(true);
      expect(requests).toContain(`/registry/${DEP}`);
      expect(requests.filter((r) => r.startsWith(`/npm/${DEP}`))).toEqual([]);
      expect(requests.filter((r) => r.startsWith("/other-registry"))).toEqual(
        [],
      );
    } finally {
      setPieceRegistryUrl(`${origin}/registry`);
    }
  }, 120_000);

  it("installs an npm piece from the host's npm config", async () => {
    const bundle = await ensurePieceBundle({
      name: NPM_PIECE,
      version: VERSION,
      cacheDir,
    });

    expect(bundle.installed).toBe(true);
    expect(
      existsSync(path.join(bundle.dir, "..", "..", DEP, "package.json")),
    ).toBe(true);
    expect(requests).toContain(`/npm/${DEP}`);
    expect(requests.filter((r) => r.startsWith(`/registry/${DEP}`))).toEqual(
      [],
    );
  }, 120_000);
});

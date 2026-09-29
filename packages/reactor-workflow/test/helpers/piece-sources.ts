// A real HTTP stand-in for the piece sources: a ph-registry, npm and the
// Activepieces CDN, on one ephemeral loopback port.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { setPublicPieceSources } from "../../src/pieces/activepieces/fetch.js";
import { clearVersionListings } from "../../src/pieces/activepieces/piece-versions.js";
import { setPieceRegistryUrl } from "../../src/pieces/activepieces/registry-source.js";

export interface FixturePiece {
  name: string;
  version: string;
  // CommonJS module text: `module.exports = { app }`.
  code: string;
}

export interface PieceSources {
  readonly url: string;
  // Every path asked for, in order.
  readonly requests: string[];
  stop(): Promise<void>;
}

function tarEntry(name: string, body: string): Buffer {
  const header = Buffer.alloc(512);
  const content = Buffer.from(body, "utf8");
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "utf8");
  header.write(content.length.toString(8).padStart(11, "0") + "\0", 124, 12);
  header.write("0", 156, 1, "utf8");
  header.write("ustar\0" + "00", 257, 8, "utf8");
  header.write("        ", 148, 8, "utf8");
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf8");
  const padded = Buffer.alloc(Math.ceil(content.length / 512) * 512);
  content.copy(padded);
  return Buffer.concat([header, padded]);
}

export function pieceTarball(piece: FixturePiece): Buffer {
  const manifest = JSON.stringify({
    name: piece.name,
    version: piece.version,
    main: "index.js",
  });
  return gzipSync(
    Buffer.concat([
      tarEntry("package/package.json", manifest),
      tarEntry("package/index.js", piece.code),
      Buffer.alloc(1024),
    ]),
  );
}

// A piece whose one action reports the version that ran it.
export function versionedPiece(
  name: string,
  version: string,
  options: { action?: string; trigger?: string } = {},
): FixturePiece {
  const action = options.action ?? "report";
  const trigger = options.trigger ?? "tick";
  return {
    name,
    version,
    code: `
const app = {
  displayName: "Fixture ${version}",
  actions: {
    ${JSON.stringify(action)}: {
      name: ${JSON.stringify(action)},
      displayName: "Report",
      props: {},
      run: async () => ({ version: ${JSON.stringify(version)} }),
    },
  },
  triggers: {
    ${JSON.stringify(trigger)}: {
      name: ${JSON.stringify(trigger)},
      displayName: "Tick",
      type: "POLLING",
      props: {},
      sampleData: { version: ${JSON.stringify(version)} },
      onEnable: async () => undefined,
      onDisable: async () => undefined,
      run: async () => [],
      test: async () => [{ version: ${JSON.stringify(version)} }],
    },
  },
};
module.exports = { app };
`,
  };
}

const dashed = (name: string) => name.replace("/", "-");
const unscoped = (name: string) =>
  name.startsWith("@") ? name.split("/")[1] : name;

// Serves `registry` from the ph-registry routes and `npm` from npm (and the
// CDN, for @activepieces names). Points the runtime at them until stop().
export async function startPieceSources(pieces: {
  registry?: FixturePiece[];
  npm?: FixturePiece[];
  // Plain files by path, e.g. a package piece served at its entryUrl.
  files?: Record<string, string>;
}): Promise<PieceSources> {
  const registry = pieces.registry ?? [];
  const npm = pieces.npm ?? [];
  const requests: string[] = [];
  const versionsOf = (list: FixturePiece[], name: string) =>
    list.filter((piece) => piece.name === name);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://fixture");
    requests.push(`${url.pathname}${url.search}`);
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const tarball = (piece: FixturePiece | undefined) => {
      if (!piece) return send(404, { error: "not found" });
      res.writeHead(200, { "content-type": "application/gzip" });
      res.end(pieceTarball(piece));
    };
    const path = url.pathname;
    const file = pieces.files?.[path];
    if (file !== undefined) {
      res.writeHead(200);
      res.end(file);
      return;
    }

    let match = /^\/registry\/pieces\/([^/]+)\/versions$/.exec(path);
    if (match) {
      const found = versionsOf(registry, decodeURIComponent(match[1]));
      if (found.length === 0) return send(404, { error: "unknown piece" });
      return send(
        200,
        found
          .map((piece) => piece.version)
          .reverse()
          .map((version) => ({
            version,
            packageVersion: version,
            publishedAt: null,
          })),
      );
    }
    match = /^\/registry\/-\/pieces\/bundled\/(.+)\.tgz$/.exec(path);
    if (match) {
      const file = match[1];
      return tarball(
        registry.find(
          (piece) => `${dashed(piece.name)}-${piece.version}` === file,
        ),
      );
    }
    match = /^\/cdn\/(.+)\.tgz$/.exec(path);
    if (match) {
      const file = match[1];
      return tarball(
        npm.find(
          (piece) =>
            piece.name.startsWith("@activepieces/") &&
            `${dashed(piece.name)}-${piece.version}` === file,
        ),
      );
    }
    match = /^\/npm\/(.+)\/-\/(.+)\.tgz$/.exec(path);
    if (match) {
      const name = decodeURIComponent(match[1]);
      const file = match[2];
      return tarball(
        npm.find(
          (piece) =>
            piece.name === name &&
            `${unscoped(piece.name)}-${piece.version}` === file,
        ),
      );
    }
    match = /^\/npm\/([^/]+)$/.exec(path);
    if (match) {
      const found = versionsOf(npm, decodeURIComponent(match[1]));
      if (found.length === 0) return send(404, { error: "Not found" });
      return send(200, {
        name: found[0].name,
        versions: Object.fromEntries(
          found.map((piece) => [piece.version, { version: piece.version }]),
        ),
      });
    }
    send(404, { error: "no route" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  clearVersionListings();
  setPieceRegistryUrl(pieces.registry ? `${url}/registry` : undefined);
  setPublicPieceSources({ cdnUrl: `${url}/cdn`, npmRegistryUrl: `${url}/npm` });
  return {
    url,
    requests,
    async stop() {
      setPieceRegistryUrl(undefined);
      setPublicPieceSources({
        cdnUrl: "http://127.0.0.1:9",
        npmRegistryUrl: "http://127.0.0.1:9",
      });
      clearVersionListings();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

// Publishes probe packages over the npm HTTP API with tarballs built in
// memory, so a publish ramp measures the registry rather than the npm CLI.
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { create } from "tar";
import type { SeedPackage } from "./mix.js";

const FIXTURE = path.resolve(import.meta.dirname, "../../fixture/package");
const PIECE_DIR = "dist/node/pieces/probe";

function readTree(dir: string, prefix = ""): Map<string, string> {
  const files = new Map<string, string>();
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) {
      for (const [k, v] of readTree(full, rel)) files.set(k, v);
    } else {
      files.set(rel, readFileSync(full, "utf8"));
    }
  }
  return files;
}

// The fixture as `ph build` leaves it, with build/ published as dist/
const template = new Map(
  [...readTree(FIXTURE)].map(([rel, content]) => [
    rel.replace(/^build\//, "dist/"),
    content,
  ]),
);

function edit(
  content: string,
  change: (json: Record<string, unknown>) => void,
): string {
  const json = JSON.parse(content) as Record<string, unknown>;
  change(json);
  return JSON.stringify(json, null, 2);
}

export function seedPackage(name: string, version = "1.0.0"): SeedPackage {
  return { name, version, piece: `@${name}/piece-probe` };
}

export function packSeed(pkg: SeedPackage): Buffer {
  const files = new Map(template);
  files.set(
    "package.json",
    edit(files.get("package.json")!, (j) => {
      j.name = pkg.name;
      j.version = pkg.version;
    }),
  );
  files.set(
    "dist/powerhouse.manifest.json",
    edit(files.get("dist/powerhouse.manifest.json")!, (j) => {
      j.name = pkg.name;
      const [piece] = j.pieces as Record<string, unknown>[];
      piece.id = pkg.piece;
      piece.version = pkg.version;
    }),
  );
  for (const file of ["package.json", "descriptor.json"]) {
    const key = `${PIECE_DIR}/${file}`;
    files.set(
      key,
      edit(files.get(key)!, (j) => {
        j.name = pkg.piece;
        j.version = pkg.version;
      }),
    );
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), "registry-stress-"));
  try {
    for (const [rel, content] of files) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), content);
    }
    const stream = create(
      { sync: true, gzip: true, cwd: dir, prefix: "package", portable: true },
      [...files.keys()],
    );
    const chunks: Buffer[] = [];
    let chunk: Buffer | null;
    while ((chunk = stream.read() as Buffer | null) !== null) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface PublishResult {
  ok: boolean;
  status: number;
  ms: number;
  finishedAt: number;
  error?: string;
}

export async function publishSeed(
  base: string,
  token: string,
  pkg: SeedPackage,
  timeoutMs = 60_000,
): Promise<PublishResult> {
  const tarball = packSeed(pkg);
  const short = pkg.name.startsWith("@") ? pkg.name.split("/")[1] : pkg.name;
  const file = `${short}-${pkg.version}.tgz`;
  const body = JSON.stringify({
    _id: pkg.name,
    name: pkg.name,
    "dist-tags": { latest: pkg.version },
    versions: {
      [pkg.version]: {
        name: pkg.name,
        version: pkg.version,
        dist: {
          tarball: `${base}/${pkg.name}/-/${file}`,
          shasum: createHash("sha1").update(tarball).digest("hex"),
          integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
        },
      },
    },
    _attachments: {
      [file]: {
        content_type: "application/octet-stream",
        data: tarball.toString("base64"),
        length: tarball.length,
      },
    },
  });
  const t0 = performance.now();
  try {
    const res = await fetch(`${base}/${encodeURIComponent(pkg.name)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      ms: performance.now() - t0,
      finishedAt: Date.now(),
      ...(res.ok ? {} : { error: text.slice(0, 200) }),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      ms: performance.now() - t0,
      finishedAt: Date.now(),
      error: (err as Error).name,
    };
  }
}

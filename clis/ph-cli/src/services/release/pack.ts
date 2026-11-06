import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { isBuildLockFile } from "../build-control.js";
import { RELEASE_APPROVAL_PATH } from "./approval.js";
import { byPath, type FileDigest } from "./revision.js";

export type PackedRelease = {
  readonly directory: string;
  readonly tarball: string;
  readonly manifest: PackedManifest;
  readonly files: ReadonlyMap<string, Buffer>;
  readonly dispose: () => void;
};

const manifestSchema = z.looseObject({
  name: z.string(),
  version: z.string(),
  main: z.string().optional(),
  exports: z.unknown().optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
});

export type PackedManifest = z.infer<typeof manifestSchema>;

const packListing = z.array(
  z.object({ name: z.string(), version: z.string(), filename: z.string() }),
);

/** npm refuses `--workspaces=false` while its configuration selects one. */
const SELECTS_WORKSPACE = /--no-workspaces and --workspace/;

export const selectsAnotherPackage = (packageRoot: string) =>
  `npm's configuration (a workspace setting in the environment or an .npmrc) selects a package other than the one in ${packageRoot}; the release approval covers that package only.`;

const BLOCK = 512;

function field(header: Buffer, start: number, length: number): string {
  const bytes = header.subarray(start, start + length);
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end === -1 ? length : end).toString("utf8");
}

function paxPath(body: Buffer): string | undefined {
  for (let offset = 0; offset < body.length;) {
    const space = body.indexOf(0x20, offset);
    const length = Number(body.subarray(offset, space).toString("ascii"));
    if (space === -1 || !(length > 0)) return undefined;
    const record = body
      .subarray(space + 1, offset + length - 1)
      .toString("utf8");
    if (record.startsWith("path=")) return record.slice("path=".length);
    offset += length;
  }
  return undefined;
}

export function readTarball(tarball: string): Map<string, Buffer> {
  const tar = gunzipSync(readFileSync(tarball));
  const files = new Map<string, Buffer>();
  let longPath: string | undefined;
  for (let offset = 0; offset + BLOCK <= tar.length;) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = parseInt(field(header, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    const body = tar.subarray(offset + BLOCK, offset + BLOCK + size);
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    if (type === "x") {
      longPath = paxPath(body) ?? longPath;
      continue;
    }
    if (type === "L") {
      longPath = field(body, 0, body.length);
      continue;
    }
    if (type === "g") continue;
    const prefix = field(header, 345, 155);
    const name = field(header, 0, 100);
    const path = longPath ?? (prefix === "" ? name : `${prefix}/${name}`);
    longPath = undefined;
    if (type === "5") continue;
    const inside = posix.normalize(path.split("/").slice(1).join("/"));
    if (
      inside === "." ||
      inside.startsWith("../") ||
      posix.isAbsolute(inside)
    ) {
      throw new Error(`the tarball has an entry outside the package: ${path}`);
    }
    const bytes =
      type === "1" || type === "2"
        ? Buffer.from(field(header, 157, 100))
        : Buffer.from(body);
    files.set(inside, bytes);
  }
  return files;
}

export function packRelease(packageRoot: string): PackedRelease {
  const directory = realpathSync.native(
    mkdtempSync(join(tmpdir(), "ph-release-")),
  );
  const dispose = () => rmSync(directory, { recursive: true, force: true });
  try {
    const packed = spawnSync(
      "npm",
      [
        "pack",
        "--json",
        "--ignore-scripts",
        "--workspaces=false",
        "--pack-destination",
        // cmd.exe splits an unquoted path at its spaces.
        process.platform === "win32" ? `"${directory}"` : directory,
      ],
      {
        cwd: packageRoot,
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      },
    );
    if (packed.status !== 0) {
      if (SELECTS_WORKSPACE.test(`${packed.stdout}${packed.stderr}`)) {
        throw new Error(selectsAnotherPackage(packageRoot));
      }
      throw new Error(
        `npm pack could not pack the package: ${(packed.stderr || packed.error?.message || packed.stdout).trim()}`,
      );
    }
    const listings = packListing.parse(JSON.parse(packed.stdout));
    const root = z
      .object({ name: z.string(), version: z.string() })
      .parse(
        JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")),
      );
    const [listing] = listings;
    const tarballs = readdirSync(directory);
    if (
      listings.length !== 1 ||
      listing.name !== root.name ||
      listing.version !== root.version ||
      tarballs.length !== 1
    ) {
      const packs = listings.map(({ name, version }) => `${name}@${version}`);
      throw new Error(
        `npm pack packs ${packs.join(", ") || "no package"}, not ${root.name}@${root.version}: ${selectsAnotherPackage(packageRoot)}`,
      );
    }
    const tarball = join(directory, tarballs[0]);
    const files = readTarball(tarball);
    const manifestBytes = files.get("package.json");
    if (manifestBytes === undefined) {
      throw new Error("npm pack wrote a tarball without a package.json");
    }
    const manifest = manifestSchema.parse(
      JSON.parse(manifestBytes.toString("utf8")),
    );
    return { directory, tarball, manifest, files, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

export function packedDigests(packed: PackedRelease): FileDigest[] {
  return [...packed.files]
    .filter(
      ([path]) => path !== RELEASE_APPROVAL_PATH && !isBuildLockFile(path),
    )
    .map(([path, bytes]) => ({
      path,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }))
    .sort(byPath);
}

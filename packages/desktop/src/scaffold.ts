import { deflateSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { appJsonSchema, APP_JSON_FILE, type AppJson } from "./app-json.js";

/**
 * P7.5 — scaffold a builder-owned desktop identity: `hosts/desktop/app.json`
 * (the ONE file a builder edits), a placeholder square icon source, and a
 * `.gitignore` for the generated shell. `ph generate desktop-shell` calls
 * this; the runner's dev/build then project app.json into `tauri-shell/`.
 */

export interface ScaffoldDesktopShellOptions {
  /** Reverse-DNS app identifier (e.g. com.acme.app). */
  identifier: string;
  /** Human product name (the window title + macOS app name). */
  productName: string;
  /** Overwrite an existing app.json (default: refuse, to protect edits). */
  force?: boolean;
}

export interface ScaffoldResult {
  hostDir: string;
  /** Files created this call (absolute paths). */
  created: string[];
  /** Files already present and left untouched. */
  skipped: string[];
}

/** Minimal PNG encoder — a solid square so `tauri icon` always has a valid
 * source. Pure Node (zlib); no binary asset ships in the package. The builder
 * replaces it with their real 1024×1024 artwork. */
export function solidPng(
  size: number,
  rgba: [number, number, number, number],
): Buffer {
  const [r, g, b, a] = rgba;
  // raw image: each row is a filter byte (0) + size*4 RGBA bytes
  const row = Buffer.alloc(1 + size * 4);
  for (let x = 0; x < size; x++) {
    const o = 1 + x * 4;
    row[o] = r;
    row[o + 1] = g;
    row[o + 2] = b;
    row[o + 3] = a;
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const idat = deflateSync(raw);

  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const body = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let crcTable: number[] | undefined;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ 0xffffffff;
}

const GITIGNORE = `# Generated tauri shell — only Cargo.lock and app-icon.png are tracked.
/tauri-shell/target
/tauri-shell/gen
/tauri-shell/icons
/tauri-shell/dist-stack
/tauri-shell/binaries
`;

export function scaffoldDesktopShell(
  hostDir: string,
  options: ScaffoldDesktopShellOptions,
): ScaffoldResult {
  const created: string[] = [];
  const skipped: string[] = [];
  fs.mkdirSync(hostDir, { recursive: true });

  const iconFile = "icon.png";
  const app: AppJson = {
    identifier: options.identifier,
    productName: options.productName,
    icon: `./${iconFile}`,
    window: { title: options.productName, width: 1440, height: 900 },
    fileAssociations: [
      {
        ext: ["phd"],
        name: "Powerhouse Document",
        mimeType: "application/vnd.powerhouse.document+zip",
      },
    ],
  };
  // Fail fast if we ever emit something the loader would reject.
  appJsonSchema.parse(app);

  const appJsonPath = path.join(hostDir, APP_JSON_FILE);
  if (fs.existsSync(appJsonPath) && !options.force) {
    skipped.push(appJsonPath);
  } else {
    fs.writeFileSync(appJsonPath, `${JSON.stringify(app, null, 2)}\n`);
    created.push(appJsonPath);
  }

  const iconPath = path.join(hostDir, iconFile);
  if (fs.existsSync(iconPath)) {
    skipped.push(iconPath);
  } else {
    // 1024² indigo placeholder — a real, square, replaceable source icon.
    fs.writeFileSync(iconPath, solidPng(1024, [79, 70, 229, 255]));
    created.push(iconPath);
  }

  const gitignorePath = path.join(hostDir, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    skipped.push(gitignorePath);
  } else {
    fs.writeFileSync(gitignorePath, GITIGNORE);
    created.push(gitignorePath);
  }

  return { hostDir, created, skipped };
}

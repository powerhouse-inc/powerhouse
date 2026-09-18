import type { Manifest } from "@powerhousedao/shared";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateAllPieces,
  generatePiece,
  generatePieceAction,
} from "../codegen/generate.js";
import { buildTsMorphProject } from "../utils/ts-morph-project.js";
import { createOrUpdateManifest } from "./manifest.js";

const originalCwd = process.cwd();
const temporary: string[] = [];

// A project of the shape `ph init` leaves behind, minus everything a piece
// does not touch; buildTsMorphProject needs the tsconfig and chdirs into it.
function makeProject(packageName = "@acme/ledger", version = "2.0.0") {
  const dir = mkdtempSync(join(tmpdir(), "ph-pieces-"));
  temporary.push(dir);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: packageName, version, type: "module" }, null, 2),
  );
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "nodenext" } }, null, 2),
  );
  return dir;
}

const readManifest = (dir: string) =>
  JSON.parse(
    readFileSync(join(dir, "powerhouse.manifest.json"), "utf8"),
  ) as Manifest;

const readList = (dir: string) =>
  readFileSync(join(dir, "pieces", "index.ts"), "utf8");

afterEach(() => {
  process.chdir(originalCwd);
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("generatePiece", () => {
  it("scaffolds the piece, lists it at the path the build reads, and names it in the manifest", async () => {
    const dir = makeProject();
    const project = buildTsMorphProject(dir);
    await generatePiece({ pieceName: "acme-crm" }, project);
    await project.save();

    for (const file of [
      "index.ts",
      "lib/logo.ts",
      "lib/auth.ts",
      "lib/common/errors.ts",
      "lib/common/auth-value.ts",
      "lib/common/client.ts",
      "lib/common/context.ts",
      "lib/actions/get-record.ts",
      "lib/triggers/new-record.ts",
    ]) {
      expect(existsSync(join(dir, "pieces", "acme-crm", file))).toBe(true);
    }

    // The literal path `resolvePieceLocation` requires; anything else fails
    // the build with "declares ..., which is missing".
    expect(readList(dir)).toContain(
      'entry: "dist/node/pieces/acme-crm/index.mjs"',
    );
    expect(readList(dir)).toContain('name: "@acme/piece-acme-crm"');
    expect(readManifest(dir).pieces).toEqual([
      { id: "@acme/piece-acme-crm", name: "Acme Crm" },
    ]);
  });

  it("ties the version to the package when the piece is named after it", async () => {
    const dir = makeProject("@acme/piece-crm", "3.1.0");
    const project = buildTsMorphProject(dir);
    await generatePiece({ pieceName: "crm" }, project);
    await project.save();

    expect(readList(dir)).toContain('version: "3.1.0"');
    await expect(
      generatePiece({ pieceName: "crm", pieceVersion: "9.9.9" }, project),
    ).rejects.toThrow("package.json says 3.1.0");
  });

  it("appends a second piece rather than rewriting the list", async () => {
    const dir = makeProject();
    const first = buildTsMorphProject(dir);
    await generatePiece({ pieceName: "acme-crm" }, first);
    await first.save();
    const afterFirst = readList(dir);

    const second = buildTsMorphProject(dir);
    await generatePiece({ pieceName: "acme-billing" }, second);
    await second.save();

    const afterSecond = readList(dir);
    expect(afterSecond).toContain("dist/node/pieces/acme-crm/index.mjs");
    expect(afterSecond).toContain("dist/node/pieces/acme-billing/index.mjs");
    // The first entry survived the second run byte for byte.
    expect(afterSecond).toContain(
      afterFirst.slice(
        afterFirst.indexOf('name: "@acme/piece-acme-crm"'),
        afterFirst.indexOf('entry: "dist/node/pieces/acme-crm/index.mjs",') +
          'entry: "dist/node/pieces/acme-crm/index.mjs",'.length,
      ),
    );
    expect(readManifest(dir).pieces).toHaveLength(2);
  });

  it("leaves an edited piece alone when it runs again", async () => {
    const dir = makeProject();
    const first = buildTsMorphProject(dir);
    await generatePiece({ pieceName: "acme-crm" }, first);
    await first.save();

    const actionFile = join(
      dir,
      "pieces",
      "acme-crm",
      "lib",
      "actions",
      "get-record.ts",
    );
    writeFileSync(actionFile, "// edited by hand\nexport const marker = 1;\n");

    const second = buildTsMorphProject(dir);
    await generatePiece({ pieceName: "acme-crm" }, second);
    await second.save();

    expect(readFileSync(actionFile, "utf8")).toContain("edited by hand");
    expect(readList(dir).match(/acme-crm/g)).toHaveLength(2);
  });

  it("refuses a list whose array it cannot find, and says what to paste", async () => {
    const dir = makeProject();
    const project = buildTsMorphProject(dir);
    await generatePiece({ pieceName: "acme-crm" }, project);
    await project.save();

    const handWritten = readList(dir).replace(
      "export const pieces",
      "export const myPieces",
    );
    writeFileSync(join(dir, "pieces", "index.ts"), handWritten);

    const second = buildTsMorphProject(dir);
    await expect(
      generatePiece({ pieceName: "acme-billing" }, second),
    ).rejects.toThrow('entry: "dist/node/pieces/acme-billing/index.mjs"');
    expect(readList(dir)).toBe(handWritten);
  });

  it("writes no auth file for --auth none", async () => {
    const dir = makeProject();
    const project = buildTsMorphProject(dir);
    await generatePiece({ pieceName: "acme-crm", auth: "none" }, project);
    await project.save();

    expect(existsSync(join(dir, "pieces", "acme-crm", "lib", "auth.ts"))).toBe(
      false,
    );
    expect(existsSync(join(dir, "pieces", "acme-crm", "lib", "common"))).toBe(
      false,
    );
    expect(
      readFileSync(join(dir, "pieces", "acme-crm", "index.ts"), "utf8"),
    ).toContain("auth: undefined");
  });
});

describe("generatePieceAction", () => {
  it("writes the action and adds it to the piece that has to name it", async () => {
    const dir = makeProject();
    const project = buildTsMorphProject(dir);
    await generatePiece({ pieceName: "acme-crm" }, project);
    await generatePieceAction({ actionName: "create record" }, project);
    await project.save();

    const pieceIndex = readFileSync(
      join(dir, "pieces", "acme-crm", "index.ts"),
      "utf8",
    );
    expect(
      existsSync(
        join(dir, "pieces", "acme-crm", "lib", "actions", "create-record.ts"),
      ),
    ).toBe(true);
    expect(pieceIndex).toContain(
      'import { acmeCrmCreateRecordAction } from "./lib/actions/create-record.js"',
    );
    expect(pieceIndex).toContain(
      "actions: [acmeCrmGetRecordAction, acmeCrmCreateRecordAction]",
    );

    await generatePieceAction({ actionName: "create-record" }, project);
    await project.save();
    expect(
      readFileSync(join(dir, "pieces", "acme-crm", "index.ts"), "utf8"),
    ).toBe(pieceIndex);
  });
});

describe("generateAllPieces", () => {
  it("drops the manifest entry of a deleted piece and leaves the list alone", async () => {
    const dir = makeProject();
    const first = buildTsMorphProject(dir);
    await generatePiece({ pieceName: "acme-crm" }, first);
    await generatePiece({ pieceName: "acme-billing" }, first);
    await first.save();

    rmSync(join(dir, "pieces", "acme-crm"), { recursive: true, force: true });
    const second = buildTsMorphProject(dir);
    await generateAllPieces(second);
    await second.save();

    expect(readManifest(dir).pieces).toEqual([
      { id: "@acme/piece-acme-billing", name: "Acme Billing" },
    ]);
    expect(readList(dir)).toContain("dist/node/pieces/acme-crm/index.mjs");
  });
});

describe("createOrUpdateManifest pieces", () => {
  it("keeps what the build wrote and lets the existing name win", async () => {
    const dir = makeProject();
    await createOrUpdateManifest(
      {
        name: "@acme/ledger",
        pieces: [
          {
            id: "@acme/piece-crm",
            name: "Acme CRM",
            version: "1.0.0",
            bundle: "dist/node/pieces/crm",
          },
        ],
      },
      dir,
    );
    await createOrUpdateManifest(
      { pieces: [{ id: "@acme/piece-crm", name: "Crm" }] },
      dir,
    );

    expect(readManifest(dir).pieces).toEqual([
      {
        id: "@acme/piece-crm",
        name: "Acme CRM",
        version: "1.0.0",
        bundle: "dist/node/pieces/crm",
      },
    ]);
  });

  it("adds no empty pieces array to a project that ships none", async () => {
    const dir = makeProject();
    await createOrUpdateManifest({ name: "@acme/ledger" }, dir);
    expect(readManifest(dir)).not.toHaveProperty("pieces");
  });
});

// `ph identity new --save` onto a medium where no file can be made the
// user's alone: the key is never written, and never printed instead.
import type * as OwnerOnly from "@powerhousedao/shared/clis/owner-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runIdentityNew } from "../src/services/identity.js";

const asked = vi.hoisted(() => [] as unknown[]);

vi.mock("@powerhousedao/shared/clis/owner-only", async (importOriginal) => {
  const real = await importOriginal<typeof OwnerOnly>();
  return {
    ...real,
    // Restricting fails here, as on exFAT or without icacls.
    createOwnerOnlyFile: (
      file: string,
      text: string,
      o?: { onlyIfRestricted?: boolean },
    ) => {
      asked.push(o);
      if (o?.onlyIfRestricted) throw new real.NotOwnerOnlyError(file);
      return real.createOwnerOnlyFile(file, text, o);
    },
  };
});

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-identity-unrestricted-"));
  asked.length = 0;
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("ph identity new --save where the file cannot be restricted", () => {
  it("writes and prints no key, and says why", () => {
    const out: string[] = [];
    const err: string[] = [];
    const file = path.join(dir, "billing.env");
    expect(
      runIdentityNew(
        { label: "billing", save: file },
        { out: (l) => out.push(l), err: (l) => err.push(l) },
      ),
    ).toBe(1);
    expect(asked).toEqual([{ onlyIfRestricted: true }]);
    expect(out).toEqual([]);
    expect(err.join("\n")).toContain(
      `Could not limit ${file} to your user, so the key is not kept there: nothing was written.`,
    );
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

import type {
  PHBaseState,
  Reducer,
} from "@powerhousedao/shared/document-model";
import {
  baseLoadFromInputVersioned,
  documentModelReducer,
} from "@powerhousedao/shared/document-model";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { minimalBackupDocument } from "../document-handlers/generators/utils.js";

const reducer = documentModelReducer as unknown as Reducer<PHBaseState>;

describe("minimalBackupDocument", () => {
  let workingDir: string;

  beforeEach(async () => {
    workingDir = await mkdtemp(join(tmpdir(), "vetra-backup-"));
  });

  afterEach(async () => {
    await rm(workingDir, { recursive: true, force: true });
  });

  it("writes the resultingState header's protocol versions and drops the header from state", async () => {
    // Shape of a reactor resultingState: state scopes plus the header.
    const state = {
      auth: { version: 0, grants: [] },
      document: { version: 1 },
      global: {},
      local: {},
      header: { protocolVersions: { signature: 2, "base-reducer": 2 } },
    } as unknown as PHBaseState;

    const filePath = await minimalBackupDocument(
      {
        documentId: "doc-1",
        documentType: "powerhouse/document-model",
        branch: "main",
        name: "Backup",
        state,
      },
      workingDir,
    );

    expect(filePath).toBeDefined();
    const doc = await baseLoadFromInputVersioned(
      new Uint8Array(await readFile(filePath!)),
      { reducers: { 1: reducer } },
    );

    expect(doc.header.protocolVersions).toEqual({
      signature: 2,
      "base-reducer": 2,
    });
    expect(doc.state).not.toHaveProperty("header");
  });
});

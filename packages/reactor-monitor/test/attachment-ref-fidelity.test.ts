import { afterEach, describe, expect, it, vi } from "vitest";
import {
  linkLocalSync,
  provisionInProcess,
  type ManagedInProcessReactor,
} from "../src/index.js";
import { descriptor, nodeChannel } from "./helpers.js";
import type { AttachmentRef } from "@powerhousedao/reactor";

/**
 * W1.4 (docs/plans/2026-10-03-multi-reactor.md, Stage 1 decision 1): Stage 1
 * is refs-only -- prove an `AttachmentRef` STRING survives the local-sync
 * path byte-identical. No byte transfer, no attachment service, no
 * dedup/resolve: those need a configured attachment service and land in
 * Stage 3 (W3.4).
 *
 * `baseDocumentModels` (DocumentModel, DocumentDrive, ReactorDrive -- the
 * monitor's in-process default set) has no document model with a field
 * dedicated to attachment references, so this rides the ref through
 * `DocumentDriveDocument`'s `FolderNode.name`: a plain string field carried
 * inside an action's input (`ADD_FOLDER`'s `name`), exactly how a real
 * `AttachmentRef` rides inside a document action's payload. The node-name
 * path is also the one `test/local-sync.test.ts` already proves travels the
 * brokered `LocalChannel` link, so this test adds no new sync surface -- only
 * a stricter assertion (exact string identity, not just "arrived") on the
 * same proven path.
 */
type DriveState = {
  state: { global: { nodes: Array<{ id: string; name: string }> } };
};

async function findNodeByName(
  reactor: ManagedInProcessReactor,
  driveId: string,
  name: string,
): Promise<{ id: string; name: string } | undefined> {
  try {
    const doc = (await reactor.client.get(driveId)) as unknown as DriveState;
    return doc.state.global.nodes.find((node) => node.name === name);
  } catch {
    return undefined;
  }
}

describe("attachment ref fidelity over local sync (W1.4, refs-only)", () => {
  const provisioned: ManagedInProcessReactor[] = [];

  async function host(name: string): Promise<ManagedInProcessReactor> {
    const reactor = await provisionInProcess(
      descriptor(name, { sync: { local: true } }),
    );
    provisioned.push(reactor);
    return reactor;
  }

  afterEach(async () => {
    for (const reactor of provisioned.splice(0)) {
      await reactor.kill();
    }
  });

  it("carries a real attachment:// ref string from A to B unmangled", async () => {
    const a = await host("ref-a");
    const b = await host("ref-b");

    const drive = await a.client.drives.create({ global: { name: "Refs" } });
    const driveId = drive.header.id;

    await linkLocalSync(a, b, { driveId, createChannel: nodeChannel });

    // Version 1 is SHA-256 hex (packages/reactor/src/attachments/types.ts);
    // this is a real digest, not a placeholder, so the fidelity check is over
    // a realistic ref shape (scheme, version tag, colon, 64 hex chars).
    const ref: AttachmentRef =
      "attachment://v1:150e9b34f1446c475288dd108b6392606cb58efd2c21906ae16791ca99b70e86";

    await a.client.drives.addFolder(driveId, ref);

    await vi.waitFor(
      async () => {
        const node = await findNodeByName(b, driveId, ref);
        expect(node).toBeDefined();
      },
      { timeout: 15_000 },
    );

    const node = await findNodeByName(b, driveId, ref);
    // Byte-identical, not merely "a matching string": the sync path ran the
    // ref through serializeEnvelope and the structured-clone hop of the
    // brokered MessagePort, and the assertion is that NEITHER step touched
    // the scheme, the version tag, the colon or any hex character.
    expect(node?.name).toBe(ref);
    expect(node?.name.length).toBe(ref.length);
    expect([...(node?.name ?? "")]).toEqual([...ref]);
  }, 30_000);
});

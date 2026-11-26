import { readCredentialRecord } from "@powerhousedao/shared/clis/credential-records";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { carriedCredentialOf } from "../src/carried-credential.js";
import { createCredentialVerifier } from "../src/credential-verifier.js";
import { testCaller } from "../src/testing.js";
import { verifyAuthBearerToken } from "../src/utils.js";

describe("testCaller", () => {
  let dataDir: string;
  const homes: string[] = [];

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-test-caller-data-"));
  });

  afterEach(() => {
    for (const dir of [dataDir, ...homes.splice(0)]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is a labelled session of its own pseudonym, with its record in the store", async () => {
    const caller = await testCaller({ dataDir, label: "agent x" });
    homes.push(caller.home);

    expect(caller.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(caller.label).toBe("agent x");
    expect(caller.signer.user?.address).toBe(caller.address);
    expect(caller.signer.app?.name).toBe("agent x");
    expect(caller.credential.credentialSubject.app).toBe("agent x");
    expect(caller.credential.credentialSubject.id).toBe(caller.signer.app?.key);
    expect(
      readCredentialRecord({ dataDir, id: caller.recordId })?.credential.id,
    ).toBe(caller.credential.id);
    // Nothing of the caller lands in the store but the record.
    expect(fs.existsSync(path.join(dataDir, ".ph", ".pseudonym.json"))).toBe(
      false,
    );
  });

  it("bears its credential, which a host on the data folder accepts by its record", async () => {
    const caller = await testCaller({ dataDir });
    homes.push(caller.home);
    const token = await caller.bearer();
    const verified = await verifyAuthBearerToken(token);
    expect(verified).not.toBe(false);
    const carried = carriedCredentialOf(
      verified as { payload: Record<string, unknown> },
    );
    expect(carried?.id).toBe(caller.credential.id);

    const verifier = createCredentialVerifier({ dataDir, watch: false });
    try {
      await expect(
        verifier.check({
          address: caller.address,
          chainId: 1,
          networkId: "eip155",
          sessionDid: caller.credential.credentialSubject.id,
        }),
      ).resolves.toMatchObject({ ok: true, via: "record", label: "test" });
    } finally {
      verifier.close();
    }
  });

  it("gives each caller its own pseudonym and session", async () => {
    const a = await testCaller({ dataDir });
    const b = await testCaller({ dataDir });
    homes.push(a.home, b.home);
    expect(a.address).not.toBe(b.address);
    expect(a.signer.app?.key).not.toBe(b.signer.app?.key);
    expect(a.recordId).not.toBe(b.recordId);
  });
});

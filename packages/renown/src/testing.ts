/**
 * Test helpers for a host's door (node): a caller with a pseudonym of its
 * own, a session labelled as asked, the credential the pseudonym signed for
 * it, that credential's record in the store's data folder, and bearers that
 * carry it. Each caller has its own key and identity home, so no test reads
 * or writes the person's `~/.ph`.
 */
import {
  generatePrivateKey,
  IDENTITY_HOME_ENV,
  IDENTITY_KEY_ENV,
} from "@powerhousedao/shared/clis/identity";
import { credentialRecordId } from "@powerhousedao/shared/clis/credential-records";
import type { ISigner } from "@powerhousedao/shared/document-model";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openSession } from "./identity.js";
import type { PowerhouseVerifiableCredential } from "./types.js";

export interface TestCaller {
  /** The caller's pseudonym. */
  address: `0x${string}`;
  /** The session's label: what its credential names and `app.name` says. */
  label: string;
  /** Signs actions as the session. */
  signer: ISigner;
  credential: PowerhouseVerifiableCredential;
  /** The id of the credential's record in `dataDir`. */
  recordId: string;
  /** The caller's identity home (its session key); a test may remove it. */
  home: string;
  /** A bearer of the session that carries its credential (`phCredential`). */
  bearer(o?: { expiresIn?: number; aud?: string }): Promise<string>;
}

/**
 * A new caller acting in the store at `dataDir`: a fresh pseudonym, its
 * session `label` (default "test") and the session credential's record in
 * `dataDir`, so a host on that data folder accepts its bearer at once.
 */
export async function testCaller(o: {
  dataDir: string;
  label?: string;
}): Promise<TestCaller> {
  const label = o.label ?? "test";
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ph-test-caller-"));
  const env = {
    [IDENTITY_HOME_ENV]: home,
    [IDENTITY_KEY_ENV]: `0x${Buffer.from(generatePrivateKey()).toString("hex")}`,
  };
  const session = await openSession({
    dataDir: o.dataDir,
    label,
    place: "home",
    interactive: false,
    target: { dataDir: o.dataDir },
    env,
  });
  const { credential } = session;
  return {
    address: session.identity.address,
    label,
    signer: session.actionSigner,
    credential,
    recordId: credentialRecordId({
      address: credential.issuer.ethereumAddress,
      chainId: Number(credential.issuer.id.split(":")[3]),
      sessionDid: credential.credentialSubject.id,
    }),
    home,
    bearer: (b) => session.bearer(b),
  };
}

import {
  applySetGrantAction,
  decide,
  setGrant,
  type Grant,
  type PHAuthState,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  parseReactorConnectionConfig,
  REACTOR_CONNECTOR_ID,
} from "document-models/connection";
import { describe, expect, it } from "vitest";
import {
  accessMismatch,
  canChangeGrants,
  planGrants,
  reactorConnections,
  signInRequired,
  switchboardGrants,
  switchboardMayWrite,
  withReactorConfig,
} from "./reactor-access.js";

const HOST = { address: "0xhost", key: "did:key:zHost" };
const USER = { address: "0xuser", key: "did:key:zUser" };

function policy(grants: PHAuthState["grants"], creator?: string): PHAuthState {
  return { version: 1, grants, ...(creator ? { creator } : {}) };
}

// A document holding `auth`, as SET_GRANT sees one.
function documentWith(auth: PHAuthState): PHDocument {
  return {
    header: { id: "doc", documentType: "powerhouse/invoice" },
    state: { auth },
  } as unknown as PHDocument;
}

describe("reactorConnections", () => {
  it("keeps only REACTOR connections on the reserved connector", () => {
    const listed = [
      { id: "a", connectorId: REACTOR_CONNECTOR_ID, authType: "REACTOR" },
      { id: "b", connectorId: "@acme/piece-x#x", authType: "SECRET_TEXT" },
      { id: "c", connectorId: "@acme/piece-x#x", authType: "REACTOR" },
    ];
    expect(reactorConnections(listed).map((c) => c.id)).toEqual(["a"]);
  });
});

describe("signInRequired", () => {
  it("asks only when enforcement is on and nobody is signed in", () => {
    expect(signInRequired({ authEnforcement: true }, false)).toBe(true);
    expect(signInRequired({ authEnforcement: true }, true)).toBe(false);
    expect(signInRequired({ authEnforcement: false }, false)).toBe(false);
    // Not known yet: building stays open; the runtime still refuses.
    expect(signInRequired(undefined, false)).toBe(false);
  });
});

describe("switchboardGrants", () => {
  const granted = (grants: Grant[]) =>
    grants.reduce(
      (document, grant) => applySetGrantAction(document, setGrant({ grant })),
      documentWith(policy([], USER.key)),
    );
  const may = (document: PHDocument, scope: string, operation: string) =>
    decide(document.state.auth, HOST, { verb: "execute", scope, operation });

  it("grants by address without auth conditions, letting the Switchboard write", () => {
    const grants = switchboardGrants(HOST, false);
    expect(grants.map((grant) => grant.principal)).toEqual([
      { address: HOST.address },
      { address: HOST.address },
    ]);

    const document = granted(grants);
    expect(may(document, "global", "SET_STATUS")).toBe("allow");
  });

  it("grants the document operations create and delete need, not grants", () => {
    const document = granted(switchboardGrants(HOST, false));
    for (const operation of [
      "DELETE_DOCUMENT",
      "ADD_RELATIONSHIP",
      "REMOVE_RELATIONSHIP",
    ]) {
      expect(may(document, "document", operation), operation).toBe("allow");
    }
    expect(may(document, "document", "UPGRADE_DOCUMENT")).toBe("deny");
    expect(may(document, "auth", "SET_GRANT")).toBe("deny");
  });

  it("grants by key under auth conditions", () => {
    const grants = switchboardGrants(HOST, true);
    expect(grants[0]?.principal).toEqual({
      match: { eq: [{ attr: "subject.key" }, { lit: HOST.key }] },
    });
    // Valid grants for the reducer.
    expect(() => granted(grants)).not.toThrow();
  });

  it("replaces its own grant when granted again", () => {
    const grants = switchboardGrants(HOST, false);
    const twice = granted([...grants, ...grants]);
    expect(twice.state.auth.grants).toHaveLength(2);
  });

  it("is empty without an identity to name", () => {
    expect(switchboardGrants(null, false)).toEqual([]);
    expect(switchboardGrants({ address: null, key: HOST.key }, false)).toEqual(
      [],
    );
    expect(
      switchboardGrants({ address: null, key: HOST.key }, true),
    ).not.toEqual([]);
  });

  it("tells a document the Switchboard may already write", () => {
    const fresh = documentWith(policy([], USER.key));
    expect(switchboardMayWrite(fresh.state.auth, HOST)).toBe(false);
    expect(
      switchboardMayWrite(
        granted(switchboardGrants(HOST, false)).state.auth,
        HOST,
      ),
    ).toBe(true);
    // Granted by key: read from the grant's id.
    expect(
      switchboardMayWrite(
        granted(switchboardGrants(HOST, true)).state.auth,
        HOST,
      ),
    ).toBe(true);
    // Global scope alone can't delete.
    expect(
      switchboardMayWrite(
        granted(switchboardGrants(HOST, false).slice(0, 1)).state.auth,
        HOST,
      ),
    ).toBe(false);
    // An uninitialized policy leaves the document open.
    expect(switchboardMayWrite(undefined, HOST)).toBe(true);
  });
});

describe("planGrants", () => {
  const anyoneAdministers = policy([
    {
      id: "admin",
      description: "",
      effect: "allow",
      principal: { anyone: true },
      capability: { can: "execute", scope: "auth" },
    },
  ]);
  const someoneElse = policy([
    {
      id: "other",
      description: "",
      effect: "allow",
      principal: { address: "0xother" },
      capability: { can: "execute" },
    },
  ]);

  it("splits documents by whether the user may change their grants", () => {
    const auths: Record<string, PHAuthState | null> = {
      open: anyoneAdministers,
      mine: policy([], USER.key),
      theirs: someoneElse,
      missing: null,
    };
    const plan = planGrants(
      ["open", "mine", "theirs", "missing"],
      (id) => auths[id],
      USER,
    );
    expect(plan.grantable).toEqual(["open", "mine"]);
    expect(plan.noPermission).toEqual(["theirs"]);
    expect(plan.notHere).toEqual(["missing"]);
  });

  it("agrees with what the auth reducer itself lets the user do", () => {
    const initialized = applySetGrantAction(
      documentWith(policy([], USER.key)),
      setGrant({ grant: switchboardGrants(HOST, false)[0]! }),
    );
    expect(canChangeGrants(initialized.state.auth, USER)).toBe(true);
    expect(canChangeGrants(initialized.state.auth, HOST)).toBe(false);
    // An uninitialized policy leaves the document open.
    expect(canChangeGrants(undefined, {})).toBe(true);
  });
});

describe("reactor config", () => {
  it("builds a config the connection model accepts", () => {
    const readOnly = withReactorConfig({}, { access: "read" });
    expect(readOnly).toEqual({ endpoint: "local", access: "read" });
    expect(parseReactorConnectionConfig(readOnly)).toEqual({
      ok: true,
      config: readOnly,
    });
    // Write access leaves nothing behind.
    expect(withReactorConfig(readOnly, { access: "write" })).toEqual({
      endpoint: "local",
    });
    expect(withReactorConfig(readOnly, {})).toEqual(readOnly);
  });

  it("flags a writing step on a read-only connection", () => {
    expect(accessMismatch("write", "read")).toMatch(/reads only/);
    expect(accessMismatch("read", "read")).toBeNull();
    expect(accessMismatch("write", undefined)).toBeNull();
  });
});

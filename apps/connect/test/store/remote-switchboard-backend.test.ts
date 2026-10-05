import {
  isOperationNotSupported,
  ReactorOperationNotSupportedError,
} from "@powerhousedao/reactor-router";
import { describe, expect, it } from "vitest";
import { createRemoteSwitchboardBackend } from "../../src/store/remote-switchboard-backend.js";

function backendClient() {
  return createRemoteSwitchboardBackend({
    name: "switchboard-remote",
    graphqlUrl: "http://localhost:4001/graphql",
  }).client;
}

describe("remote Switchboard backend drives sub-proxy", () => {
  it("await client.drives resolves to the drives proxy and does not reject", async () => {
    const client = backendClient();

    // Before the `then` guard on the sub-proxy, resolving `client.drives` saw a
    // throwing `then` stub, treated the object as a thenable, and rejected with
    // a 'not supported' error. It must resolve to the proxy object instead.
    // Promise.resolve routes through the same thenable detection `await` uses.
    const drives = await Promise.resolve(client.drives);

    expect(drives).toBeDefined();
    expect(typeof drives).toBe("object");
  });

  it("still refuses a real drives method by name", () => {
    const client = backendClient();
    const drives = client.drives as unknown as { addDrive: () => unknown };

    expect(() => drives.addDrive()).toThrow(
      /does not support "drives\.addDrive"/,
    );
  });
});

describe("remote Switchboard backend unsupported-operation signal", () => {
  it("refuses an unsupported member with a typed ReactorOperationNotSupportedError the router can recognise", () => {
    const client = backendClient();
    // `find` is the operation Connect's boot getDrives fans in; the remote
    // GraphQL client cannot serve it, and the throw must be the TYPED error the
    // router's fan-in excludes rather than a generic Error it would fail on.
    let thrown: unknown;
    try {
      (client as unknown as { find: () => unknown }).find();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ReactorOperationNotSupportedError);
    expect(isOperationNotSupported(thrown)).toBe(true);
    const typed = thrown as ReactorOperationNotSupportedError;
    expect(typed.backend).toBe("switchboard-remote");
    expect(typed.operation).toBe("find");
    // The helpful served-methods message content is preserved.
    expect(typed.message).toMatch(/get, subscribe, execute/);
  });
});

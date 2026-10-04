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
      /does not support 'drives\.addDrive'/,
    );
  });
});

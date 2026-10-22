import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isPortAvailable } from "../src/server.mjs";

// A host without IPv6, e.g. a container: binding `::` fails before the port is tried.
function withoutIpv6() {
  const { listen } = net.Server.prototype as unknown as {
    listen: (this: net.Server, ...args: unknown[]) => net.Server;
  };
  return vi.spyOn(net.Server.prototype, "listen").mockImplementation(function (
    this: net.Server,
    ...args: unknown[]
  ) {
    const [options] = args as [{ host?: string } | undefined];
    if (options?.host === "::") {
      const error = Object.assign(new Error("address family not supported"), {
        code: "EAFNOSUPPORT",
      });
      queueMicrotask(() => this.emit("error", error));
      return this;
    }
    return listen.apply(this, args);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isPortAvailable", () => {
  it("probes IPv4 on a host without IPv6", async () => {
    withoutIpv6();
    const busy = net.createServer();
    await new Promise<void>((resolve) =>
      busy.listen({ port: 0, host: "0.0.0.0" }, resolve),
    );
    const { port } = busy.address() as net.AddressInfo;
    try {
      await expect(isPortAvailable(port)).resolves.toBe(false);
    } finally {
      await new Promise((resolve) => busy.close(resolve));
    }
    await expect(isPortAvailable(port)).resolves.toBe(true);
  });
});

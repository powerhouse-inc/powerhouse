// Who a public route's limits are charged to, and the counters.
import { describe, expect, it } from "vitest";
import {
  clientAddress,
  limitKey,
  perMinuteLimit,
} from "../../src/http/client-limits.js";

const request = (remoteAddress: string, forwardedFor?: string | string[]) => ({
  socket: { remoteAddress } as never,
  headers:
    forwardedFor === undefined ? {} : { "x-forwarded-for": forwardedFor },
});

describe("clientAddress", () => {
  it("is the socket's address unless a proxy is trusted, whatever the header says", () => {
    expect(
      clientAddress(request("::ffff:198.51.100.4", "1.2.3.4"), false),
    ).toBe("198.51.100.4");
  });

  it("behind a trusted proxy, is the right-most hop that is not a deployment's own", () => {
    for (const [header, expected] of [
      ["203.0.113.7", "203.0.113.7"],
      ["1.1.1.1, 203.0.113.7, 10.1.2.3", "203.0.113.7"],
      ["1.1.1.1, 203.0.113.7:4321, 172.20.0.5, 127.0.0.1", "203.0.113.7"],
      ["[2001:db8::1]:443, fd00::5, fe80::1", "2001:db8::1"],
      // A private network only: the farthest hop.
      ["192.168.1.20, 10.0.0.2", "192.168.1.20"],
      // Garbage is no hop.
      ["nonsense, 203.0.113.9", "203.0.113.9"],
    ] as const) {
      expect(clientAddress(request("10.0.0.1", header), true), header).toBe(
        expected,
      );
    }
    expect(
      clientAddress(request("10.0.0.1", ["9.9.9.9", "203.0.113.1"]), true),
    ).toBe("203.0.113.1");
    // No header: the socket's.
    expect(clientAddress(request("10.0.0.1"), true)).toBe("10.0.0.1");
  });

  it("ignores the header from a peer outside the deployment, even with a trusted proxy", () => {
    expect(
      clientAddress(request("198.51.100.4", "203.0.113.7, 10.0.0.2"), true),
    ).toBe("198.51.100.4");
    expect(clientAddress(request("::ffff:198.51.100.4", "1.2.3.4"), true)).toBe(
      "198.51.100.4",
    );
    expect(clientAddress(request("127.0.0.1", "203.0.113.7"), true)).toBe(
      "203.0.113.7",
    );
  });
});

describe("limitKey", () => {
  it("counts an IPv6 client by its /64, and an IPv4 one by its address", () => {
    for (const [address, key] of [
      ["2001:db8:1:2:aaaa::1", "2001:db8:1:2::/64"],
      ["2001:0db8:0001:0002:ffff:ffff:ffff:ffff", "2001:db8:1:2::/64"],
      ["2001:db8::1", "2001:db8:0:0::/64"],
      ["2001:db8:0:0:1::", "2001:db8:0:0::/64"],
      ["::1", "0:0:0:0::/64"],
      ["fe80::1%eth0", "fe80:0:0:0::/64"],
      ["64:ff9b::198.51.100.7", "64:ff9b:0:0::/64"],
      ["198.51.100.7", "198.51.100.7"],
      ["unknown", "unknown"],
    ] as const) {
      expect(limitKey(address), address).toBe(key);
    }
  });
});

describe("perMinuteLimit", () => {
  it("charges every address of an IPv6 /64 as one client", () => {
    const limited = perMinuteLimit(2, () => 0);
    expect([
      limited("2001:db8:1:2::1"),
      limited("2001:db8:1:2::2"),
      limited("2001:db8:1:2:ffff::3"),
    ]).toEqual([false, false, true]);
    expect(limited("2001:db8:1:3::1")).toBe(false);
  });

  it("counts per client and minute, and forgets ended windows only", () => {
    let at = 0;
    const limited = perMinuteLimit(2, () => at, 2);
    expect([limited("a"), limited("a"), limited("a")]).toEqual([
      false,
      false,
      true,
    ]);
    at = 30_000;
    expect(limited("b")).toBe(false);
    // The table is full of live windows: a new client is refused, the
    // others keep their counts.
    expect(limited("c")).toBe(true);
    expect(limited("a")).toBe(true);
    at = 61_000;
    // a's window ended; b's runs on.
    expect(limited("c")).toBe(false);
    expect([limited("b"), limited("b")]).toEqual([false, true]);
  });
});

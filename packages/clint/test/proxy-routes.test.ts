// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import { describe, it, expect } from "vitest";
import {
  buildSwitchboardRoutes,
  buildSwitchboardRouteSpecs,
  buildServiceRoutes,
  captureRoutePrefix,
  deriveBasePath,
  resolveImplicitProxyRoot,
  resolveServiceProxyContext,
  isWsEndpointType,
  normalizeLoopbackHost,
  prefixMatches,
} from "../src/core/proxy-routes.js";
import type {
  ServiceDefinition,
  ServiceInstanceStatus,
} from "../src/core/types.js";

describe("isWsEndpointType", () => {
  it("returns true for api-mcp", () => {
    expect(isWsEndpointType("api-mcp")).toBe(true);
  });

  it("returns true for website (dev-server HMR sockets)", () => {
    expect(isWsEndpointType("website")).toBe(true);
  });

  it("returns false for other types", () => {
    expect(isWsEndpointType("api-rest")).toBe(false);
    expect(isWsEndpointType("api-graphql")).toBe(false);
    expect(isWsEndpointType("other")).toBe(false);
  });
});

describe("prefixMatches", () => {
  it("matches on segment boundaries, not bare startsWith", () => {
    expect(prefixMatches("/foo", "/foo")).toBe(true);
    expect(prefixMatches("/foo", "/foo/x")).toBe(true);
    expect(prefixMatches("/foo", "/foobar")).toBe(false);
    expect(prefixMatches("/d", "/d/drive-123")).toBe(true);
    expect(prefixMatches("/d", "/drive-export")).toBe(false);
  });

  it("root prefix matches everything", () => {
    expect(prefixMatches("/", "/")).toBe(true);
    expect(prefixMatches("/", "/anything/here")).toBe(true);
  });

  it("trailing-slash prefix matches the bare prefix and any continuation", () => {
    expect(
      prefixMatches("/switchboard/attachments/", "/switchboard/attachments"),
    ).toBe(true);
    expect(
      prefixMatches(
        "/switchboard/attachments/",
        "/switchboard/attachments/abc",
      ),
    ).toBe(true);
    expect(
      prefixMatches("/switchboard/attachments/", "/switchboard/attachmentsX"),
    ).toBe(false);
  });
});

describe("normalizeLoopbackHost", () => {
  it("rewrites localhost to 127.0.0.1, preserving the port", () => {
    expect(normalizeLoopbackHost("localhost")).toBe("127.0.0.1");
    expect(normalizeLoopbackHost("localhost:4001")).toBe("127.0.0.1:4001");
    expect(normalizeLoopbackHost("LOCALHOST:8080")).toBe("127.0.0.1:8080");
  });

  it("leaves non-loopback and already-numeric hosts untouched", () => {
    expect(normalizeLoopbackHost("127.0.0.1:3001")).toBe("127.0.0.1:3001");
    expect(normalizeLoopbackHost("example.com:443")).toBe("example.com:443");
    expect(normalizeLoopbackHost("upstream.internal")).toBe(
      "upstream.internal",
    );
  });
});

describe("buildSwitchboardRoutes", () => {
  it("produces 4 routes under /switchboard/", () => {
    const routes = buildSwitchboardRoutes(
      "http://localhost:4001",
      "http://localhost:4002",
    );
    expect(routes).toHaveLength(4);
    expect(routes.map((r) => r.prefix)).toEqual([
      "/switchboard/graphql",
      "/switchboard/d/",
      "/switchboard/attachments/",
      "/switchboard/mcp",
    ]);
  });

  it("sets correct upstream URLs", () => {
    const routes = buildSwitchboardRoutes(
      "http://localhost:4001",
      "http://localhost:4002",
    );
    expect(routes[0].upstream.toString()).toBe("http://localhost:4001/graphql");
    expect(routes[1].upstream.toString()).toBe("http://localhost:4001/d/");
    expect(routes[2].upstream.toString()).toBe(
      "http://localhost:4001/attachments/",
    );
    expect(routes[3].upstream.toString()).toBe("http://localhost:4002/mcp");
  });

  it("maps /switchboard/attachments/<hash> to the switchboard /attachments/<hash> upstream", () => {
    const routes = buildSwitchboardRoutes(
      "http://localhost:4001",
      "http://localhost:4002",
    );
    const attachments = routes.find(
      (r) => r.prefix === "/switchboard/attachments/",
    );
    expect(attachments).toBeDefined();
    expect(attachments!.upstream.toString()).toBe(
      "http://localhost:4001/attachments/",
    );
    // suffix beyond the prefix is the bare hash, appended to the upstream path
    const hash = "abc123";
    const requestPath = `/switchboard/attachments/${hash}`;
    const suffix = requestPath.slice(attachments!.prefix.length);
    expect(attachments!.upstream.pathname + suffix).toBe(
      `/attachments/${hash}`,
    );
  });

  it("only marks MCP route as ws-enabled", () => {
    const routes = buildSwitchboardRoutes(
      "http://localhost:4001",
      "http://localhost:4002",
    );
    expect(routes[0].ws).toBe(false);
    expect(routes[1].ws).toBe(false);
    expect(routes[2].ws).toBe(false);
    expect(routes[3].ws).toBe(true);
  });

  it("sets source to switchboard", () => {
    const routes = buildSwitchboardRoutes(
      "http://localhost:4001",
      "http://localhost:4002",
    );
    for (const r of routes) {
      expect(r.source).toBe("switchboard");
    }
  });
});

describe("buildServiceRoutes", () => {
  it("extracts routes from single-pattern captures", () => {
    const def: ServiceDefinition = {
      id: "my-svc",
      command: "echo",
      readiness: {
        pattern: /listening on (http:\/\/\S+)/,
        captures: {
          mcp: { group: 1, type: "api-mcp" },
        },
        timeout: 5000,
      },
    };

    const instance: ServiceInstanceStatus = {
      serviceId: "my-svc",
      instanceId: "i1",
      name: "my-svc",
      status: "ready",
      endpoints: { mcp: "http://localhost:3000/mcp" },
    };

    const routes = buildServiceRoutes(def, instance);
    expect(routes).toHaveLength(1);
    expect(routes[0].prefix).toBe("/my-svc/mcp");
    expect(routes[0].upstream.toString()).toBe("http://localhost:3000/mcp");
    expect(routes[0].ws).toBe(true);
    expect(routes[0].source).toBe("service:my-svc");
  });

  it("extracts routes from multi-pattern captures", () => {
    const def: ServiceDefinition = {
      id: "multi",
      command: "echo",
      readiness: {
        patterns: [
          {
            name: "graphql",
            pattern: /GraphQL at (http:\/\/\S+)/,
            captures: { gql: { group: 1, type: "api-graphql" } },
          },
          {
            name: "mcp",
            pattern: /MCP at (http:\/\/\S+)/,
            captures: { mcp: { group: 1, type: "api-mcp" } },
          },
        ],
        timeout: 5000,
      },
    };

    const instance: ServiceInstanceStatus = {
      serviceId: "multi",
      instanceId: "i1",
      name: "multi",
      status: "ready",
      endpoints: {
        gql: "http://localhost:4001/graphql",
        mcp: "http://localhost:4002/mcp",
      },
    };

    const routes = buildServiceRoutes(def, instance);
    expect(routes).toHaveLength(2);
    expect(routes.map((r) => r.prefix)).toEqual(["/multi/gql", "/multi/mcp"]);
  });

  it("skips captures without endpoint type", () => {
    const def: ServiceDefinition = {
      id: "svc",
      command: "echo",
      readiness: {
        pattern: /listening on (http:\/\/\S+)/,
        captures: { url: 1 }, // plain number, no type
        timeout: 5000,
      },
    };

    const instance: ServiceInstanceStatus = {
      serviceId: "svc",
      instanceId: "i1",
      name: "svc",
      status: "ready",
      endpoints: { url: "http://localhost:3000" },
    };

    const routes = buildServiceRoutes(def, instance);
    expect(routes).toHaveLength(0);
  });

  it("skips captures with missing endpoint URL", () => {
    const def: ServiceDefinition = {
      id: "svc",
      command: "echo",
      readiness: {
        pattern: /listening on (http:\/\/\S+)/,
        captures: { mcp: { group: 1, type: "api-mcp" } },
        timeout: 5000,
      },
    };

    const instance: ServiceInstanceStatus = {
      serviceId: "svc",
      instanceId: "i1",
      name: "svc",
      status: "ready",
      endpoints: {}, // missing mcp endpoint
    };

    const routes = buildServiceRoutes(def, instance);
    expect(routes).toHaveLength(0);
  });

  it("returns empty array for service without readiness", () => {
    const def: ServiceDefinition = {
      id: "svc",
      command: "echo",
    };

    const instance: ServiceInstanceStatus = {
      serviceId: "svc",
      instanceId: "i1",
      name: "svc",
      status: "ready",
    };

    const routes = buildServiceRoutes(def, instance);
    expect(routes).toHaveLength(0);
  });
});

function websiteDef(
  id: string,
  captureName: string,
  proxyRoot?: boolean,
): ServiceDefinition {
  return {
    id,
    command: "echo",
    readiness: {
      pattern: /Local: (http:\/\/\S+)/,
      captures: { [captureName]: { group: 1, type: "website", proxyRoot } },
      timeout: 5000,
    },
  };
}

function readyInstance(
  id: string,
  captureName: string,
  url: string,
): ServiceInstanceStatus {
  return {
    serviceId: id,
    instanceId: "i1",
    name: id,
    status: "ready",
    endpoints: { [captureName]: url },
  };
}

describe("website routing and proxy root", () => {
  it("routes a website with proxyRoot at /", () => {
    const def = websiteDef("studio", "ui", true);
    const routes = buildServiceRoutes(
      def,
      readyInstance("studio", "ui", "http://localhost:3000"),
    );
    expect(routes).toHaveLength(1);
    expect(routes[0].prefix).toBe("/");
  });

  it("routes a website without proxyRoot under its prefix", () => {
    const def = websiteDef("project", "ui");
    const routes = buildServiceRoutes(
      def,
      readyInstance("project", "ui", "http://localhost:3001"),
    );
    expect(routes).toHaveLength(1);
    expect(routes[0].prefix).toBe("/project/ui");
  });

  it("routes the implicit root website at /", () => {
    const def = websiteDef("studio", "ui");
    const routes = buildServiceRoutes(
      def,
      readyInstance("studio", "ui", "http://localhost:3000"),
      { serviceId: "studio", captureName: "ui" },
    );
    expect(routes[0].prefix).toBe("/");
  });

  it("ignores proxyRoot on non-website captures", () => {
    const def: ServiceDefinition = {
      id: "svc",
      command: "echo",
      readiness: {
        pattern: /at (http:\/\/\S+)/,
        captures: { rest: { group: 1, type: "api-rest", proxyRoot: true } },
        timeout: 5000,
      },
    };
    const routes = buildServiceRoutes(
      def,
      readyInstance("svc", "rest", "http://localhost:3000/api"),
    );
    expect(routes[0].prefix).toBe("/svc/rest");
  });
});

describe("resolveImplicitProxyRoot", () => {
  it("picks the only website capture across all definitions", () => {
    const defs = [
      websiteDef("studio", "ui"),
      {
        id: "api",
        command: "echo",
        readiness: {
          pattern: /at (http:\/\/\S+)/,
          captures: { rest: { group: 1, type: "api-rest" as const } },
          timeout: 5000,
        },
      },
    ];
    expect(resolveImplicitProxyRoot(defs)).toEqual({
      serviceId: "studio",
      captureName: "ui",
    });
  });

  it("returns undefined when several websites exist", () => {
    const defs = [websiteDef("studio", "ui"), websiteDef("project", "ui")];
    expect(resolveImplicitProxyRoot(defs)).toBeUndefined();
  });

  it("returns undefined when any capture sets proxyRoot explicitly", () => {
    const defs = [websiteDef("studio", "ui", true)];
    expect(resolveImplicitProxyRoot(defs)).toBeUndefined();
  });

  it("returns undefined when no websites exist", () => {
    expect(
      resolveImplicitProxyRoot([{ id: "svc", command: "echo" }]),
    ).toBeUndefined();
  });
});

describe("captureRoutePrefix", () => {
  it("returns /{serviceId}/{captureName}", () => {
    expect(captureRoutePrefix("my-svc", "mcp")).toBe("/my-svc/mcp");
    expect(captureRoutePrefix("reactor-project", "vetra-studio")).toBe(
      "/reactor-project/vetra-studio",
    );
  });
});

describe("buildSwitchboardRouteSpecs", () => {
  it("produces relative-prefix specs under the default base prefix", () => {
    const specs = buildSwitchboardRouteSpecs(
      "http://localhost:4001",
      "http://localhost:4002",
    );
    expect(specs.map((s) => s.prefix)).toEqual([
      "switchboard/graphql",
      "switchboard/d/",
      "switchboard/attachments/",
      "switchboard/mcp",
    ]);
    expect(specs[0].upstream.toString()).toBe("http://localhost:4001/graphql");
    expect(specs[3].upstream.toString()).toBe("http://localhost:4002/mcp");
    expect(specs.map((s) => s.ws)).toEqual([false, false, false, true]);
  });

  it("supports a custom base prefix", () => {
    const specs = buildSwitchboardRouteSpecs(
      "http://localhost:4001",
      undefined,
      "sb",
    );
    expect(specs.map((s) => s.prefix)).toEqual([
      "sb/graphql",
      "sb/d/",
      "sb/attachments/",
    ]);
  });

  it("omits the mcp spec when mcpUrl is absent", () => {
    const specs = buildSwitchboardRouteSpecs("http://localhost:4001");
    expect(specs).toHaveLength(3);
    expect(specs.find((s) => s.prefix.endsWith("/mcp"))).toBeUndefined();
    expect(specs.every((s) => !s.ws)).toBe(true);
  });
});

describe("resolveServiceProxyContext", () => {
  it("passes through an origin-only URL with empty basePath", () => {
    expect(resolveServiceProxyContext("http://localhost:8090")).toEqual({
      publicUrl: "http://localhost:8090",
      basePath: "",
    });
  });

  it("derives basePath from a subpath", () => {
    expect(resolveServiceProxyContext("https://example.com/sub")).toEqual({
      publicUrl: "https://example.com/sub",
      basePath: "/sub",
    });
  });

  it("strips trailing slashes from both publicUrl and basePath", () => {
    expect(resolveServiceProxyContext("https://example.com/sub///")).toEqual({
      publicUrl: "https://example.com/sub",
      basePath: "/sub",
    });
  });

  it("treats a scheme-less value as unset", () => {
    // new URL('localhost:8090') parses with protocol 'localhost:'.
    expect(resolveServiceProxyContext("localhost:8090")).toEqual({
      publicUrl: undefined,
      basePath: "",
    });
  });

  it("treats a garbage string as unset", () => {
    expect(resolveServiceProxyContext("not a url")).toEqual({
      publicUrl: undefined,
      basePath: "",
    });
  });

  it("treats undefined and whitespace as unset", () => {
    expect(resolveServiceProxyContext(undefined)).toEqual({
      publicUrl: undefined,
      basePath: "",
    });
    expect(resolveServiceProxyContext("   ")).toEqual({
      publicUrl: undefined,
      basePath: "",
    });
  });
});

describe("deriveBasePath", () => {
  it("returns empty for a scheme-less value", () => {
    expect(deriveBasePath("localhost:8090")).toBe("");
  });
});

describe("buildServiceRoutes proxyRoutes hook", () => {
  const instance: ServiceInstanceStatus = {
    serviceId: "proj",
    instanceId: "i1",
    name: "proj",
    status: "ready",
    endpoints: { sb: "http://localhost:4001" },
  };

  it("mounts relative prefixes under /{serviceId}/ with service source", () => {
    const def: ServiceDefinition = {
      id: "proj",
      command: "echo",
      proxyRoutes: (inst) => [
        {
          prefix: "switchboard/graphql",
          upstream: new URL("/graphql", inst.endpoints!.sb),
        },
        {
          prefix: "switchboard/mcp",
          upstream: "http://localhost:4002/mcp",
          ws: true,
        },
      ],
    };

    const routes = buildServiceRoutes(def, instance);
    expect(routes.map((r) => r.prefix)).toEqual([
      "/proj/switchboard/graphql",
      "/proj/switchboard/mcp",
    ]);
    expect(routes[0].upstream!.toString()).toBe(
      "http://localhost:4001/graphql",
    );
    expect(routes[0].ws).toBe(false);
    expect(routes[1].upstream!.toString()).toBe("http://localhost:4002/mcp");
    expect(routes[1].ws).toBe(true);
    for (const r of routes) {
      expect(r.source).toBe("service:proj");
    }
  });

  it("strips a leading slash from spec prefixes", () => {
    const def: ServiceDefinition = {
      id: "proj",
      command: "echo",
      proxyRoutes: () => [
        { prefix: "/api", upstream: "http://localhost:5000" },
      ],
    };
    const routes = buildServiceRoutes(def, instance);
    expect(routes[0].prefix).toBe("/proj/api");
  });

  it("skips specs with invalid upstream URLs", () => {
    const def: ServiceDefinition = {
      id: "proj",
      command: "echo",
      proxyRoutes: () => [
        { prefix: "bad", upstream: "not a url" },
        { prefix: "good", upstream: "http://localhost:5000" },
      ],
    };
    const routes = buildServiceRoutes(def, instance);
    expect(routes.map((r) => r.prefix)).toEqual(["/proj/good"]);
  });

  it("keeps capture routes when the hook throws", () => {
    const def: ServiceDefinition = {
      id: "proj",
      command: "echo",
      readiness: {
        pattern: /at (http:\/\/\S+)/,
        captures: { sb: { group: 1, type: "api-graphql" } },
        timeout: 5000,
      },
      proxyRoutes: () => {
        throw new Error("boom");
      },
    };
    const routes = buildServiceRoutes(def, instance);
    expect(routes.map((r) => r.prefix)).toEqual(["/proj/sb"]);
  });

  it("combines capture routes and hook routes", () => {
    const def: ServiceDefinition = {
      id: "proj",
      command: "echo",
      readiness: {
        pattern: /at (http:\/\/\S+)/,
        captures: { sb: { group: 1, type: "api-graphql" } },
        timeout: 5000,
      },
      proxyRoutes: () => [
        { prefix: "extra", upstream: "http://localhost:5000" },
      ],
    };
    const routes = buildServiceRoutes(def, instance);
    expect(routes.map((r) => r.prefix)).toEqual(["/proj/sb", "/proj/extra"]);
  });
});

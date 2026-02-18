import { describe, expect, it, vi } from "vitest";

/**
 * Tests for the drive info REST endpoint protocol detection.
 *
 * When deployed behind a reverse proxy (Heroku, Traefik, nginx, etc.),
 * the proxy terminates SSL and forwards requests over HTTP internally.
 * The original protocol is preserved in the X-Forwarded-Proto header.
 */
describe("Drive Info Endpoint - Protocol Detection", () => {
  /**
   * Helper to simulate the protocol detection logic used in GraphQLManager.
   * This mirrors the logic in #setupDriveInfoRestEndpoint
   */
  function getProtocol(req: {
    get: (header: string) => string | undefined;
    protocol: string;
  }): string {
    const forwardedProto = req.get("x-forwarded-proto");
    return (forwardedProto ?? req.protocol) + ":";
  }

  function buildGraphqlEndpoint(
    req: {
      get: (header: string) => string | undefined;
      protocol: string;
    },
    basePath: string,
  ): string {
    const protocol = getProtocol(req);
    const host = req.get("host") ?? "";
    const normalizedBasePath = basePath === "/" ? "" : basePath;
    return `${protocol}//${host}${normalizedBasePath}/graphql/r`;
  }

  describe("getProtocol", () => {
    it("should return https when X-Forwarded-Proto is https (behind reverse proxy)", () => {
      const mockReq = {
        get: vi.fn((header: string) => {
          if (header === "x-forwarded-proto") return "https";
          return undefined;
        }),
        protocol: "http", // Internal connection is HTTP
      };

      const protocol = getProtocol(mockReq);
      expect(protocol).toBe("https:");
    });

    it("should return http when X-Forwarded-Proto is http", () => {
      const mockReq = {
        get: vi.fn((header: string) => {
          if (header === "x-forwarded-proto") return "http";
          return undefined;
        }),
        protocol: "http",
      };

      const protocol = getProtocol(mockReq);
      expect(protocol).toBe("http:");
    });

    it("should fallback to req.protocol when X-Forwarded-Proto is not set (direct connection)", () => {
      const mockReq = {
        get: vi.fn(() => undefined),
        protocol: "http",
      };

      const protocol = getProtocol(mockReq);
      expect(protocol).toBe("http:");
    });

    it("should fallback to req.protocol https for direct HTTPS connections", () => {
      const mockReq = {
        get: vi.fn(() => undefined),
        protocol: "https",
      };

      const protocol = getProtocol(mockReq);
      expect(protocol).toBe("https:");
    });
  });

  describe("buildGraphqlEndpoint", () => {
    it("should build correct HTTPS endpoint when behind Heroku proxy", () => {
      const mockReq = {
        get: vi.fn((header: string) => {
          if (header === "x-forwarded-proto") return "https";
          if (header === "host") return "my-app.herokuapp.com";
          return undefined;
        }),
        protocol: "http",
      };

      const endpoint = buildGraphqlEndpoint(mockReq, "/");
      expect(endpoint).toBe("https://my-app.herokuapp.com/graphql/r");
    });

    it("should build correct HTTPS endpoint when behind Traefik proxy", () => {
      const mockReq = {
        get: vi.fn((header: string) => {
          if (header === "x-forwarded-proto") return "https";
          if (header === "host") return "api.powerhouse.dev";
          return undefined;
        }),
        protocol: "http",
      };

      const endpoint = buildGraphqlEndpoint(mockReq, "/");
      expect(endpoint).toBe("https://api.powerhouse.dev/graphql/r");
    });

    it("should build correct HTTP endpoint for local development", () => {
      const mockReq = {
        get: vi.fn((header: string) => {
          if (header === "host") return "localhost:3000";
          return undefined;
        }),
        protocol: "http",
      };

      const endpoint = buildGraphqlEndpoint(mockReq, "/");
      expect(endpoint).toBe("http://localhost:3000/graphql/r");
    });

    it("should include base path when not root", () => {
      const mockReq = {
        get: vi.fn((header: string) => {
          if (header === "x-forwarded-proto") return "https";
          if (header === "host") return "api.example.com";
          return undefined;
        }),
        protocol: "http",
      };

      const endpoint = buildGraphqlEndpoint(mockReq, "/api/v1");
      expect(endpoint).toBe("https://api.example.com/api/v1/graphql/r");
    });
  });
});

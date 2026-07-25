import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { S3AttachmentPrimitives } from "../../../src/storage/s3/index.js";
import {
  S3_COMPATIBILITY_CASES,
  isAllowedCorsPreflight,
  isDeniedCorsPreflight,
  runS3CompatibilityProbe,
  type S3CompatibilityProbeDependencies,
} from "../../../scripts/verify-s3-compatibility.js";

const hash = "4e87" + "ab".repeat(30);
const config = {
  endpoint: "https://example.com",
  region: "region",
  bucket: "bucket",
  accessKeyId: "id",
  secretAccessKey: "secret",
  prefix: "attachments",
  forcePathStyle: true,
  uploadTtlSeconds: 900,
  downloadTtlSeconds: 300,
};

describe("S3 SDK primitives", () => {
  it("builds exact HeadObject, checksum-bound PutObject, and GetObject commands", async () => {
    const sent: object[] = [];
    const presigned: Array<{ command: object; ttl: number }> = [];
    const client = {
      send: vi.fn((command: object) => {
        sent.push(command);
        return Promise.resolve({});
      }),
    };
    const primitives = new S3AttachmentPrimitives(config, {
      client,
      now: () => new Date("2026-07-21T00:00:00.000Z"),
      presign: vi.fn((_client: object, command: object, ttl: number) => {
        presigned.push({ command, ttl });
        return Promise.resolve("https://example.com/signed?redacted=1");
      }),
    });

    const head = primitives.buildHeadObjectCommand(hash) as { input: unknown };
    const put = primitives.buildPutObjectCommand(hash, "text/plain") as {
      input: unknown;
    };
    const get = primitives.buildGetObjectCommand(hash) as { input: unknown };
    expect(head.input).toEqual({
      Bucket: "bucket",
      Key: `attachments/4e/87/${hash}`,
    });
    expect(put.input).toEqual({
      Bucket: "bucket",
      Key: `attachments/4e/87/${hash}`,
      ContentType: "text/plain",
      ChecksumSHA256: "Toerq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s=",
    });
    expect(get.input).toEqual({
      Bucket: "bucket",
      Key: `attachments/4e/87/${hash}`,
    });
    await primitives.headObject(hash);
    expect(sent[0]).toBeInstanceOf(Object);

    const upload = await primitives.createUploadTarget(hash, "text/plain");
    const download = await primitives.createDownloadTarget(hash);
    expect(presigned.map(({ ttl }) => ttl)).toEqual([900, 300]);
    expect(upload).toEqual({
      kind: "presigned-put",
      method: "PUT",
      url: "https://example.com/signed?redacted=1",
      headers: {
        "content-type": "text/plain",
        "x-amz-checksum-sha256": "Toerq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s=",
      },
      expiresAtUtc: "2026-07-21T00:15:00.000Z",
    });
    expect(download.expiresAtUtc).toBe("2026-07-21T00:05:00.000Z");
  });

  it("keeps the checksum in the signed headers instead of hoisting it into the URL", async () => {
    const primitives = new S3AttachmentPrimitives(config);
    const target = await primitives.createUploadTarget(hash, "text/plain");
    const url = new URL(target.url);
    expect(url.searchParams.has("x-amz-checksum-sha256")).toBe(false);
    expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toContain(
      "x-amz-checksum-sha256",
    );
  });
});

describe("S3 compatibility probe", () => {
  const allowedOrigin = "https://allowed.example";
  const deniedOrigin = "https://denied.example";
  const now = 42;
  const expectedBytes = new TextEncoder().encode(`attachment-s3-probe-${now}`);
  const expectedHash = createHash("sha256").update(expectedBytes).digest("hex");
  const expectedMissingHash = createHash("sha256")
    .update(`${expectedHash}-missing`)
    .digest("hex");

  function uploadTarget(url: string) {
    return {
      kind: "presigned-put" as const,
      method: "PUT" as const,
      url,
      headers: {
        "content-type": "application/octet-stream",
        "x-amz-checksum-sha256": "expected-checksum",
      },
      expiresAtUtc: "2026-07-21T00:00:01.000Z",
    };
  }

  function downloadTarget(url: string) {
    return {
      kind: "presigned-get" as const,
      method: "GET" as const,
      url,
      headers: {},
      expiresAtUtc: "2026-07-21T00:00:01.000Z",
    };
  }

  function createProbeHarness(options: { failWithSecret?: boolean } = {}) {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const events: string[] = [];
    const normalHeadHashes: string[] = [];
    const wrongHeadHashes: string[] = [];
    const normalUploadTtls: Array<number | undefined> = [];
    const normalDownloadTtls: Array<number | undefined> = [];
    const wrongUploadTtls: Array<number | undefined> = [];
    const createdAccessKeys: string[] = [];

    const normalPrimitives = {
      createUploadTarget: (_hash: string, _mimeType: string, ttl?: number) => {
        normalUploadTtls.push(ttl);
        return Promise.resolve(
          uploadTarget(
            ttl === 1
              ? "https://provider.example/expired-put?signature=expired"
              : "https://provider.example/object?signature=valid-put",
          ),
        );
      },
      createDownloadTarget: (_hash: string, ttl?: number) => {
        normalDownloadTtls.push(ttl);
        return Promise.resolve(
          downloadTarget(
            ttl === 1
              ? "https://provider.example/expired-get?signature=expired"
              : "https://provider.example/object?signature=valid-get",
          ),
        );
      },
      headObject: (headHash: string) => {
        normalHeadHashes.push(headHash);
        if (normalHeadHashes.length === 2) {
          return Promise.reject(
            Object.assign(new Error("not found"), {
              $metadata: { httpStatusCode: 404 },
            }),
          );
        }
        return Promise.resolve({});
      },
    };
    const wrongPrimitives = {
      createUploadTarget: (_hash: string, _mimeType: string, ttl?: number) => {
        wrongUploadTtls.push(ttl);
        return Promise.resolve(
          uploadTarget(
            "https://provider.example/object?signature=wrong-credentials",
          ),
        );
      },
      createDownloadTarget: (_hash: string, _ttl?: number) =>
        Promise.resolve(
          downloadTarget(
            "https://provider.example/object?signature=wrong-credentials",
          ),
        ),
      headObject: (headHash: string) => {
        wrongHeadHashes.push(headHash);
        return Promise.reject(
          Object.assign(new Error("forbidden"), {
            $metadata: { httpStatusCode: 403 },
          }),
        );
      },
    };

    const dependencies: S3CompatibilityProbeDependencies = {
      createPrimitives: (candidate) => {
        createdAccessKeys.push(candidate.accessKeyId);
        return candidate.accessKeyId.endsWith("-invalid")
          ? wrongPrimitives
          : normalPrimitives;
      },
      now: () => now,
      sleep: (milliseconds) => {
        events.push(`sleep:${milliseconds}`);
        return Promise.resolve();
      },
      fetch: (input, init) => {
        const url = String(input);
        const index = fetchCalls.length;
        fetchCalls.push({ url, init });
        events.push(`fetch:${url}`);
        if (options.failWithSecret) {
          return Promise.reject(
            new Error("secret https://provider.example/?signature=private"),
          );
        }
        if (index === 0)
          return Promise.resolve(new Response(null, { status: 200 }));
        if (index >= 1 && index <= 3) {
          return Promise.resolve(new Response(null, { status: 400 }));
        }
        if (index === 4) {
          return Promise.resolve(new Response(expectedBytes, { status: 200 }));
        }
        if (index >= 5 && index <= 8) {
          return Promise.resolve(new Response(null, { status: 403 }));
        }
        if (index >= 9 && index <= 11) {
          return Promise.resolve(
            new Response(null, {
              status: 204,
              headers: {
                "access-control-allow-origin": allowedOrigin,
                "access-control-allow-methods": "PUT, GET, HEAD",
                "access-control-allow-headers":
                  "Content-Type, X-Amz-Checksum-Sha256",
              },
            }),
          );
        }
        return Promise.resolve(new Response(null, { status: 403 }));
      },
    };

    return {
      dependencies,
      fetchCalls,
      events,
      normalHeadHashes,
      wrongHeadHashes,
      normalUploadTtls,
      normalDownloadTtls,
      wrongUploadTtls,
      createdAccessKeys,
    };
  }

  it("runs the real provider interaction sequence and classifications", async () => {
    const harness = createProbeHarness();
    const output: string[] = [];
    const passed = await runS3CompatibilityProbe(
      { config, allowedOrigin, deniedOrigin },
      harness.dependencies,
      (line) => output.push(line),
    );
    expect(passed).toBe(true);
    expect(output).toEqual(
      S3_COMPATIBILITY_CASES.map((name) => `PASS ${name}`),
    );
    expect(harness.createdAccessKeys).toEqual(["id", "id-invalid"]);
    expect(harness.normalUploadTtls).toEqual([undefined, 1]);
    expect(harness.normalDownloadTtls).toEqual([undefined, 1]);
    expect(harness.wrongUploadTtls).toEqual([undefined]);
    expect(harness.normalHeadHashes).toEqual([
      expectedHash,
      expectedMissingHash,
    ]);
    expect(harness.wrongHeadHashes).toEqual([expectedHash]);
    expect(harness.fetchCalls).toHaveLength(13);

    const correctPut = harness.fetchCalls[0];
    expect(correctPut.url).toContain("signature=valid-put");
    expect(correctPut.init?.method).toBe("PUT");
    expect(Array.from(correctPut.init?.body as Uint8Array)).toEqual(
      Array.from(expectedBytes),
    );
    expect(
      new Headers(correctPut.init?.headers).get("x-amz-checksum-sha256"),
    ).toBe("expected-checksum");

    const wrongPut = harness.fetchCalls[1];
    expect(new TextDecoder().decode(wrongPut.init?.body as Uint8Array)).toBe(
      "attachment-s3-probe-wrong",
    );
    expect(
      new Headers(harness.fetchCalls[2].init?.headers).has(
        "x-amz-checksum-sha256",
      ),
    ).toBe(false);
    expect(
      new Headers(harness.fetchCalls[3].init?.headers).get(
        "x-amz-checksum-sha256",
      ),
    ).toBe("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    expect(harness.fetchCalls[4].init?.method).toBe("GET");
    expect(harness.fetchCalls[5].url).toContain("expired-put");
    expect(harness.fetchCalls[6].url).toContain("expired-get");
    expect(harness.events.indexOf("sleep:1100")).toBeLessThan(
      harness.events.indexOf(`fetch:${harness.fetchCalls[5].url}`),
    );
    expect(harness.fetchCalls[7]).toMatchObject({
      url: "https://provider.example/object",
      init: { method: "GET" },
    });
    expect(harness.fetchCalls[8].url).toContain("wrong-credentials");
    expect(harness.fetchCalls[8].init?.method).toBe("PUT");

    const corsCalls = harness.fetchCalls.slice(9);
    expect(
      corsCalls.map((call) =>
        new Headers(call.init?.headers).get("access-control-request-method"),
      ),
    ).toEqual(["PUT", "GET", "HEAD", "PUT"]);
    expect(
      new Headers(corsCalls[0].init?.headers).get(
        "access-control-request-headers",
      ),
    ).toBe("content-type,x-amz-checksum-sha256");
    expect(new Headers(corsCalls[3].init?.headers).get("origin")).toBe(
      deniedOrigin,
    );
  });

  it("redacts exceptions from the real orchestration", async () => {
    const harness = createProbeHarness({ failWithSecret: true });
    const output: string[] = [];
    await runS3CompatibilityProbe(
      { config, allowedOrigin, deniedOrigin },
      harness.dependencies,
      (line) => output.push(line),
    );
    expect(output).toHaveLength(S3_COMPATIBILITY_CASES.length);
    expect(output.some((line) => line.startsWith("FAIL"))).toBe(true);
    expect(output.join("\n")).not.toContain("secret");
    expect(output.join("\n")).not.toContain("signature");
  });

  it("requires exact origin, methods, and checksum/content-type CORS headers", () => {
    const complete = new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": allowedOrigin,
        "access-control-allow-methods": "PUT, GET, HEAD",
        "access-control-allow-headers": "Content-Type, X-Amz-Checksum-Sha256",
      },
    });
    expect(
      isAllowedCorsPreflight(complete, allowedOrigin, "PUT", [
        "content-type",
        "x-amz-checksum-sha256",
      ]),
    ).toBe(true);
    expect(isAllowedCorsPreflight(complete, allowedOrigin, "GET")).toBe(true);
    expect(isAllowedCorsPreflight(complete, allowedOrigin, "HEAD")).toBe(true);

    const missingHeader = new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": allowedOrigin,
        "access-control-allow-methods": "PUT",
        "access-control-allow-headers": "content-type",
      },
    });
    expect(
      isAllowedCorsPreflight(missingHeader, allowedOrigin, "PUT", [
        "content-type",
        "x-amz-checksum-sha256",
      ]),
    ).toBe(false);
    expect(
      isAllowedCorsPreflight(
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "PUT, GET, HEAD",
            "access-control-allow-headers":
              "content-type,x-amz-checksum-sha256",
          },
        }),
        allowedOrigin,
        "PUT",
        ["content-type", "x-amz-checksum-sha256"],
      ),
    ).toBe(false);
  });

  it("rejects wildcard or reflected permission for the denied origin", () => {
    for (const origin of ["*", deniedOrigin]) {
      expect(
        isDeniedCorsPreflight(
          new Response(null, {
            status: 204,
            headers: { "access-control-allow-origin": origin },
          }),
          deniedOrigin,
        ),
      ).toBe(false);
    }
    expect(
      isDeniedCorsPreflight(new Response(null, { status: 403 }), deniedOrigin),
    ).toBe(true);
  });

  it("keeps AWS SDK imports out of browser-reachable source", async () => {
    const files = [
      new URL("../../../src/client.ts", import.meta.url),
      new URL("../../../src/switchboard/index.ts", import.meta.url),
      new URL(
        "../../../../reactor-browser/src/hooks/use-attachments.ts",
        import.meta.url,
      ),
    ];
    for (const file of files) {
      expect(await readFile(file, "utf8")).not.toContain("@aws-sdk");
    }
  });
});

import type { PackageInfo } from "@powerhousedao/shared/registry";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RegistryClient } from "../src/registry/client.js";
import {
  getPackagePage,
  getPackages,
  getPackagesForDocumentType,
  searchPackages,
} from "../src/registry/fetchers.js";

function pkg(i: number): PackageInfo {
  const name = `@acme/pkg-${String(i).padStart(3, "0")}`;
  return {
    name,
    path: `/-/cdn/${name}`,
    manifest: {
      name,
      description: i % 10 === 0 ? "Invoices and billing" : "Other",
    } as PackageInfo["manifest"],
    documentTypes: i % 20 === 0 ? ["acme/invoice"] : [],
  };
}

const PACKAGES = Array.from({ length: 120 }, (_, i) => pkg(i));

let server: Server;
let url: string;
const seen: URL[] = [];

// A registry answering `GET /packages` with pages, as the registry does.
beforeEach(async () => {
  seen.length = 0;
  server = createServer((req, res) => {
    const reqUrl = new URL(req.url ?? "/", "http://registry");
    seen.push(reqUrl);
    const q = reqUrl.searchParams;
    const search = (q.get("search") ?? "").toLowerCase();
    const documentType = q.get("documentType");
    const matches = PACKAGES.filter(
      (p) =>
        (p.name.includes(search) ||
          p.manifest!.description!.toLowerCase().includes(search)) &&
        (!documentType || p.documentTypes.includes(documentType)),
    );
    const limit = Math.min(Number(q.get("limit") ?? 30), 50);
    const offset = Number(q.get("offset") ?? 0);
    const items = matches.slice(offset, offset + limit);
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        items:
          q.get("detail") === "full"
            ? items
            : items.map(({ name, path }) => ({ name, path })),
        total: matches.length,
        limit,
        offset,
        hasMore: offset + limit < matches.length,
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("getPackages", () => {
  it("pages the registry in full detail", async () => {
    expect(await getPackages(url)).toEqual(PACKAGES);
    expect(
      seen.map((u) => [
        u.searchParams.get("offset"),
        u.searchParams.get("detail"),
      ]),
    ).toEqual([
      ["0", "full"],
      ["50", "full"],
      ["100", "full"],
    ]);
  });
});

describe("searchPackages", () => {
  it("searches on the server in full detail", async () => {
    expect(await searchPackages(url, "billing")).toEqual(
      PACKAGES.filter((_, i) => i % 10 === 0),
    );
    expect(seen.every((u) => u.searchParams.get("search") === "billing")).toBe(
      true,
    );
  });

  it("returns everything for an empty query through the client", async () => {
    const client = new RegistryClient(`${url}-/cdn/`);
    expect(await client.searchPackages("")).toEqual(PACKAGES);
    expect(await client.searchPackages("pkg-00")).toHaveLength(10);
  });
});

describe("getPackagesForDocumentType", () => {
  it("filters on the server in full detail", async () => {
    expect(await getPackagesForDocumentType(url, "acme/invoice")).toEqual(
      PACKAGES.filter((_, i) => i % 20 === 0),
    );
    expect(seen[0]?.searchParams.get("documentType")).toBe("acme/invoice");
    expect(seen[0]?.searchParams.get("detail")).toBe("full");
  });
});

describe("getPackagePage", () => {
  it("reads one trimmed page", async () => {
    const page = await getPackagePage(url, { limit: 10, offset: 20 });
    expect(page.items[0]).toEqual({
      name: PACKAGES[20].name,
      path: PACKAGES[20].path,
    });
    expect(page).toMatchObject({
      total: 120,
      limit: 10,
      offset: 20,
      hasMore: true,
    });
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  devtoolsTokenTag,
  readDevtoolsBase,
  readDevtoolsToken,
} from "../src/host.js";
import { resolveHost } from "../src/props.js";

function serveToken(content: string) {
  const meta = document.createElement("meta");
  meta.name = "ph-devtools-token";
  meta.content = content;
  document.head.append(meta);
}

afterEach(() => {
  document.head.innerHTML = "";
});

describe("readDevtoolsToken", () => {
  it("is the token the dev server put in the page", () => {
    serveToken(" abc ");
    expect(readDevtoolsToken()).toBe("abc");
  });

  it("is undefined on a page without the tag, or with an empty one", () => {
    expect(readDevtoolsToken()).toBeUndefined();
    serveToken("");
    expect(readDevtoolsToken()).toBeUndefined();
  });

  it("is undefined where there is no document", () => {
    vi.stubGlobal("document", undefined);
    expect(readDevtoolsToken()).toBeUndefined();
    vi.unstubAllGlobals();
  });
});

describe("the dev server's tag", () => {
  it("carries the token and the base path to the page", () => {
    document.head.innerHTML = devtoolsTokenTag("abc", "/app/");
    expect(readDevtoolsToken()).toBe("abc");
    expect(readDevtoolsBase()).toBe("/app/");
  });

  it("keeps a base path with a quote in it inside its attribute", () => {
    document.head.innerHTML = devtoolsTokenTag("abc", '/a"><script>');
    expect(document.head.children).toHaveLength(1);
    expect(readDevtoolsBase()).toBe('/a"><script>');
  });

  it("has no base on a page without it", () => {
    expect(readDevtoolsBase()).toBeUndefined();
  });
});

describe("resolveHost", () => {
  it("puts the API and the page below the base path", () => {
    for (const base of ["/app/", "/app", "app"]) {
      expect(resolveHost({ base })).toMatchObject({
        apiBase: "/app/__ph/devtools/api",
        standaloneHref: "/app/__ph/devtools",
        appHref: "/app/",
      });
    }
  });

  it("works with no prop, on an app served at /", () => {
    expect(resolveHost({})).toMatchObject({
      apiBase: "/__ph/devtools/api",
      standaloneHref: "/__ph/devtools",
      appHref: "/",
      bottomRightReserved: 0,
      app: {},
    });
  });

  it("keeps the hrefs the host names", () => {
    expect(
      resolveHost({
        base: "/app/",
        standaloneHref: "/tools",
        appHref: "/home",
      }),
    ).toMatchObject({
      apiBase: "/app/__ph/devtools/api",
      standaloneHref: "/tools",
      appHref: "/home",
    });
  });
});

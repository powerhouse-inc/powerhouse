import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appJsonSchema, updateEndpoints } from "../src/app-json.js";
import {
  collectRelease,
  feedFileName,
  FEED_FILE_TEMPLATE,
  releaseBaseUrl,
  releaseFileName,
  releaseReport,
} from "../src/release.js";

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A bundle folder as tauri leaves it: `files` by path, each with its content. */
function bundle(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-release-"));
  temporary.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

const BASE = "https://github.com/acme/taco/releases/download/v1.2.3";
const NOW = new Date("2026-11-13T12:00:00.000Z");
const feedOf = (dir: string, name: string) =>
  JSON.parse(readFileSync(path.join(dir, name), "utf8")) as {
    version: string;
    pub_date: string;
    platforms: Record<string, { signature: string; url: string }>;
  };

describe("a build's release files", () => {
  it("Linux: both packages, each offered to the apps installed from it", () => {
    const bundleDir = bundle({
      "deb/Taco_1.2.3_amd64.deb": "deb",
      "deb/Taco_1.2.3_amd64.deb.sig": "deb-signature\n",
      "appimage/Taco_1.2.3_amd64.AppImage": "appimage",
      "appimage/Taco_1.2.3_amd64.AppImage.sig": "appimage-signature\n",
    });
    const release = collectRelease({
      bundleDir,
      productName: "Taco",
      version: "1.2.3",
      baseUrl: BASE,
      platform: "linux",
      arch: "x64",
      now: NOW,
    });
    expect(release.dir).toBe(path.join(bundleDir, "release"));
    expect(release.feed).toBe("latest-linux-x86_64.json");
    expect(readdirSync(release.dir).sort()).toEqual([
      "Taco_1.2.3_amd64.AppImage",
      "Taco_1.2.3_amd64.deb",
      "latest-linux-x86_64.json",
    ]);
    expect(feedOf(release.dir, release.feed!)).toEqual({
      version: "1.2.3",
      pub_date: "2026-11-13T12:00:00.000Z",
      platforms: {
        "linux-x86_64-deb": {
          signature: "deb-signature",
          url: `${BASE}/Taco_1.2.3_amd64.deb`,
        },
        "linux-x86_64-appimage": {
          signature: "appimage-signature",
          url: `${BASE}/Taco_1.2.3_amd64.AppImage`,
        },
      },
    });
    expect(release.targets).toEqual([
      "linux-x86_64-appimage",
      "linux-x86_64-deb",
    ]);
    expect(
      readFileSync(path.join(release.dir, "Taco_1.2.3_amd64.deb"), "utf8"),
    ).toBe("deb");
  });

  it("a build that lost its AppImage still releases the .deb", () => {
    const bundleDir = bundle({
      "deb/Taco_1.2.3_amd64.deb": "deb",
      "deb/Taco_1.2.3_amd64.deb.sig": "deb-signature",
    });
    const release = collectRelease({
      bundleDir,
      productName: "Taco",
      version: "1.2.3",
      baseUrl: BASE,
      platform: "linux",
      arch: "x64",
    });
    expect(release.targets).toEqual(["linux-x86_64-deb"]);
  });

  it("macOS: the disk image for people, the bundle's archive for the running app, named for its processor", () => {
    const bundleDir = bundle({
      "dmg/Taco_1.2.3_aarch64.dmg": "dmg",
      "macos/Taco.app.tar.gz": "archive",
      "macos/Taco.app.tar.gz.sig": "archive-signature",
    });
    const release = collectRelease({
      bundleDir,
      productName: "Taco",
      version: "1.2.3",
      baseUrl: BASE,
      platform: "darwin",
      arch: "arm64",
    });
    expect(release.feed).toBe("latest-darwin-aarch64.json");
    expect(release.files).toEqual([
      "Taco_1.2.3_aarch64.dmg",
      "Taco_1.2.3_aarch64.app.tar.gz",
      "latest-darwin-aarch64.json",
    ]);
    expect(feedOf(release.dir, release.feed!).platforms).toEqual({
      "darwin-aarch64-app": {
        signature: "archive-signature",
        url: `${BASE}/Taco_1.2.3_aarch64.app.tar.gz`,
      },
    });
    // The disk image is no update, so its missing signature is no finding.
    expect(release.unsigned).toEqual([]);
  });

  it("Windows: the setup program is both the installer and the update", () => {
    const bundleDir = bundle({
      "nsis/Taco_1.2.3_x64-setup.exe": "setup",
      "nsis/Taco_1.2.3_x64-setup.exe.sig": "setup-signature",
    });
    const release = collectRelease({
      bundleDir,
      productName: "Taco",
      version: "1.2.3",
      baseUrl: BASE,
      platform: "win32",
      arch: "x64",
    });
    expect(release.feed).toBe("latest-windows-x86_64.json");
    expect(feedOf(release.dir, release.feed!).platforms).toEqual({
      "windows-x86_64-nsis": {
        signature: "setup-signature",
        url: `${BASE}/Taco_1.2.3_x64-setup.exe`,
      },
    });
  });

  it("names a file as its host will, so the feed points at what is there", () => {
    expect(releaseFileName("Taco Tent_1.2.3_amd64.deb")).toBe(
      "Taco.Tent_1.2.3_amd64.deb",
    );
    expect(releaseFileName("Taco_1.2.3_x64-setup.exe")).toBe(
      "Taco_1.2.3_x64-setup.exe",
    );
    const bundleDir = bundle({
      "deb/Taco Tent_1.2.3_amd64.deb": "deb",
      "deb/Taco Tent_1.2.3_amd64.deb.sig": "deb-signature",
      "macos/Taco Tent.app.tar.gz": "archive",
    });
    const release = collectRelease({
      bundleDir,
      productName: "Taco Tent",
      version: "1.2.3",
      baseUrl: BASE,
      platform: "linux",
      arch: "x64",
    });
    expect(
      existsSync(path.join(release.dir, "Taco.Tent_1.2.3_amd64.deb")),
    ).toBe(true);
    expect(
      feedOf(release.dir, release.feed!).platforms["linux-x86_64-deb"].url,
    ).toBe(`${BASE}/Taco.Tent_1.2.3_amd64.deb`);
  });

  it("leaves an earlier build's files out, and last time's release folder with them", () => {
    const bundleDir = bundle({
      "deb/Taco_1.2.2_amd64.deb": "old",
      "deb/Taco_1.2.2_amd64.deb.sig": "old-signature",
      "deb/Taco_1.2.3_amd64.deb": "new",
      "deb/Taco_1.2.3_amd64.deb.sig": "new-signature",
      "release/Taco_1.2.2_amd64.deb": "old",
    });
    const since = Date.now();
    const old = new Date(since - 60_000);
    for (const name of ["Taco_1.2.2_amd64.deb", "Taco_1.2.2_amd64.deb.sig"]) {
      utimesSync(path.join(bundleDir, "deb", name), old, old);
    }
    const release = collectRelease({
      bundleDir,
      productName: "Taco",
      version: "1.2.3",
      baseUrl: BASE,
      since,
      platform: "linux",
      arch: "x64",
    });
    expect(release.files).toEqual([
      "Taco_1.2.3_amd64.deb",
      "latest-linux-x86_64.json",
    ]);
    expect(readdirSync(release.dir).sort()).toEqual([
      "Taco_1.2.3_amd64.deb",
      "latest-linux-x86_64.json",
    ]);
    expect(
      feedOf(release.dir, release.feed!).platforms["linux-x86_64-deb"]
        .signature,
    ).toBe("new-signature");
  });

  it("offers nothing it cannot vouch for: an unsigned installer is kept, and said", () => {
    const bundleDir = bundle({ "deb/Taco_1.2.3_amd64.deb": "deb" });
    const release = collectRelease({
      bundleDir,
      productName: "Taco",
      version: "1.2.3",
      baseUrl: BASE,
      platform: "linux",
      arch: "x64",
    });
    expect(release.files).toEqual(["Taco_1.2.3_amd64.deb"]);
    expect(release.feed).toBeNull();
    expect(release.unsigned).toEqual(["Taco_1.2.3_amd64.deb"]);
    expect(releaseReport(release, BASE).join("\n")).toMatch(/has no signature/);
  });

  it("writes no feed without knowing where the files will be, and says how to tell it", () => {
    const bundleDir = bundle({
      "deb/Taco_1.2.3_amd64.deb": "deb",
      "deb/Taco_1.2.3_amd64.deb.sig": "deb-signature",
    });
    const release = collectRelease({
      bundleDir,
      productName: "Taco",
      version: "1.2.3",
      baseUrl: null,
      platform: "linux",
      arch: "x64",
    });
    expect(release.files).toEqual(["Taco_1.2.3_amd64.deb"]);
    expect(release.feed).toBeNull();
    expect(releaseReport(release, null).join("\n")).toMatch(
      /PH_DESKTOP_RELEASE_URL/,
    );
  });

  it("says so when the build made nothing", () => {
    const release = collectRelease({
      bundleDir: bundle({}),
      productName: "Taco",
      version: "1.2.3",
      baseUrl: BASE,
      platform: "linux",
      arch: "x64",
    });
    expect(release.files).toEqual([]);
    expect(releaseReport(release, BASE)).toEqual([
      "no release files: the build made no installer.",
    ]);
  });
});

describe("where a release's files are downloaded from", () => {
  const PUBKEY = Buffer.from(
    "untrusted comment: minisign public key: CA47C789AB9ABDC1\nRWTB\n",
  ).toString("base64");
  const github = { github: "acme/taco", pubkey: PUBKEY };
  const own = {
    endpoints: ["https://updates.acme.example/latest-{{target}}-{{arch}}.json"],
    pubkey: PUBKEY,
  };

  it("the GitHub release of the tag a workflow runs for, else of the version", () => {
    expect(
      releaseBaseUrl(github, "1.2.3", {
        GITHUB_REF_TYPE: "tag",
        GITHUB_REF_NAME: "v1.2.3-rc.1",
      }),
    ).toBe("https://github.com/acme/taco/releases/download/v1.2.3-rc.1");
    expect(
      releaseBaseUrl(github, "1.2.3", {
        GITHUB_REF_TYPE: "branch",
        GITHUB_REF_NAME: "main",
      }),
    ).toBe(BASE);
    expect(releaseBaseUrl(github, "1.2.3", {})).toBe(BASE);
  });

  it("anywhere else the build is told, which also overrides GitHub", () => {
    const env = {
      PH_DESKTOP_RELEASE_URL: "https://downloads.acme.example/taco/1.2.3/",
    };
    expect(releaseBaseUrl(own, "1.2.3", env)).toBe(
      "https://downloads.acme.example/taco/1.2.3",
    );
    expect(releaseBaseUrl(github, "1.2.3", env)).toBe(
      "https://downloads.acme.example/taco/1.2.3",
    );
    expect(releaseBaseUrl(own, "1.2.3", {})).toBeNull();
  });

  it("refuses an address a release build would not download from", () => {
    for (const bad of [
      "http://downloads.acme.example/taco",
      "downloads.acme.example",
    ]) {
      expect(() =>
        releaseBaseUrl(github, "1.2.3", { PH_DESKTOP_RELEASE_URL: bad }),
      ).toThrow(/PH_DESKTOP_RELEASE_URL/);
    }
  });

  it("the app asks for the feed file by the name its build wrote", () => {
    const fill = (os: string, arch: string) =>
      FEED_FILE_TEMPLATE.replace("{{target}}", os).replace("{{arch}}", arch);
    expect(fill("linux", "x86_64")).toBe(feedFileName("linux", "x86_64"));
    const app = appJsonSchema.parse({
      identifier: "com.acme.taco",
      productName: "Taco",
      icon: "./icon.png",
      updates: github,
    });
    expect(updateEndpoints(app.updates!)).toEqual([
      `https://github.com/acme/taco/releases/latest/download/${FEED_FILE_TEMPLATE}`,
    ]);
  });
});

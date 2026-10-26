import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_SETTINGS,
  ENROLLMENT_FILE,
  projectRootOf,
  readEnrollment,
  readSiteSettings,
  stateDirOf,
  writeEnrollment,
  writeFileAtomic,
  writeSiteSettings,
} from "../src/state.js";
import { enrollment } from "./fixtures.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "portle-state-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("projectRootOf", () => {
  it("is the config file's directory, else the working directory", () => {
    expect(
      projectRootOf({ configFile: join(dir, "powerhouse.config.json") }),
    ).toBe(resolve(dir));
    expect(projectRootOf({})).toBe(process.cwd());
    expect(projectRootOf(undefined)).toBe(process.cwd());
    expect(projectRootOf({ configFile: "" })).toBe(process.cwd());
  });

  it("puts the state under .ph/portle", () => {
    expect(stateDirOf("/p")).toBe(join("/p", ".ph", "portle"));
  });
});

describe("enrolment and settings files", () => {
  it("round-trips the enrolment and creates the directory", () => {
    const stateDir = join(dir, ".ph", "portle");
    expect(readEnrollment(stateDir)).toBeNull();
    writeEnrollment(stateDir, enrollment);
    expect(existsSync(join(stateDir, ENROLLMENT_FILE))).toBe(true);
    expect(readEnrollment(stateDir)).toEqual(enrollment);
  });

  it("refuses a corrupt enrolment", () => {
    writeFileAtomic(join(dir, ENROLLMENT_FILE), '{"siteId":"x"}');
    expect(() => readEnrollment(dir)).toThrow(/not a valid enrolment/);
  });

  it("fills settings defaults and keeps what was written", () => {
    expect(readSiteSettings(dir)).toBeNull();
    writeSiteSettings(dir, {
      ...DEFAULT_SITE_SETTINGS,
      controlPlaneUrl: "https://cp-relaytest.portle.host",
      upstreams: { api: "127.0.0.1:7540" },
    });
    expect(readSiteSettings(dir)).toEqual({
      controlPlaneUrl: "https://cp-relaytest.portle.host",
      appUpstream: "127.0.0.1:3000",
      upstreams: { api: "127.0.0.1:7540" },
      dns01Mode: "rfc2136",
      autostart: false,
    });
  });

  it("writes atomically: no temp file is left behind", () => {
    writeFileAtomic(join(dir, "a.txt"), "hello", 0o600);
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("hello");
    expect(existsSync(join(dir, "a.txt.tmp"))).toBe(false);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  scanProjects,
  PROJECT_INDICATORS,
} from "../src/core/project-scanner.js";
import type { ProjectScanner } from "../src/core/types.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-scanner-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function mkdir(...segments: string[]): string {
  const dir = path.join(tmpDir, ...segments);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function touch(...segments: string[]): void {
  const filePath = path.join(tmpDir, ...segments);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

describe("PROJECT_INDICATORS", () => {
  it("is a non-empty array of strings", () => {
    expect(PROJECT_INDICATORS.length).toBeGreaterThan(0);
    for (const ind of PROJECT_INDICATORS) {
      expect(typeof ind).toBe("string");
    }
  });
});

describe("scanProjects", () => {
  const hasMarker: ProjectScanner = {
    isProjectFolder: (p) => fs.existsSync(path.join(p, "marker.txt")),
  };

  it("returns empty array for empty directory", () => {
    expect(scanProjects(tmpDir, hasMarker)).toEqual([]);
  });

  it("returns root if root matches", () => {
    fs.writeFileSync(path.join(tmpDir, "marker.txt"), "");
    const results = scanProjects(tmpDir, hasMarker);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe(tmpDir);
    expect(results[0]!.name).toBe(path.basename(tmpDir));
  });

  it("finds matching subfolders", () => {
    mkdir("project-a");
    touch("project-a", "marker.txt");
    mkdir("project-b");
    touch("project-b", "marker.txt");

    const results = scanProjects(tmpDir, hasMarker);
    expect(results).toHaveLength(2);
    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(["project-a", "project-b"]);
  });

  it("prunes subtree on match", () => {
    mkdir("parent");
    touch("parent", "marker.txt");
    mkdir("parent", "child");
    touch("parent", "child", "marker.txt");

    const results = scanProjects(tmpDir, hasMarker);
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe("parent");
  });

  it("prunes foreign projects (mismatch)", () => {
    mkdir("foreign");
    touch("foreign", "package.json"); // indicator, not marker
    mkdir("foreign", "nested");
    touch("foreign", "nested", "marker.txt");

    const results = scanProjects(tmpDir, hasMarker);
    expect(results).toEqual([]);
  });

  it("recurses into non-project directories", () => {
    mkdir("group", "deep");
    touch("group", "deep", "marker.txt");

    const results = scanProjects(tmpDir, hasMarker);
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe("deep");
  });

  it("skips dotfiles/dotdirs", () => {
    mkdir(".hidden");
    touch(".hidden", "marker.txt");

    const results = scanProjects(tmpDir, hasMarker);
    expect(results).toEqual([]);
  });

  it("uses getProjectName when provided", () => {
    mkdir("proj");
    touch("proj", "marker.txt");

    const scanner: ProjectScanner = {
      isProjectFolder: hasMarker.isProjectFolder,
      getProjectName: () => "custom-name",
    };
    const results = scanProjects(tmpDir, scanner);
    expect(results[0]!.name).toBe("custom-name");
  });

  it("uses getProjectConfig when provided", () => {
    mkdir("proj");
    touch("proj", "marker.txt");

    const scanner: ProjectScanner = {
      isProjectFolder: hasMarker.isProjectFolder,
      getProjectConfig: () => ({ key: "value" }),
    };
    const results = scanProjects(tmpDir, scanner);
    expect(results[0]!.config).toEqual({ key: "value" });
  });

  it("config is undefined when getProjectConfig not provided", () => {
    mkdir("proj");
    touch("proj", "marker.txt");

    const results = scanProjects(tmpDir, hasMarker);
    expect(results[0]!.config).toBeUndefined();
  });

  it("populates documentId/documentType from getDocumentLink", () => {
    mkdir("proj");
    touch("proj", "marker.txt");

    const scanner: ProjectScanner = {
      isProjectFolder: hasMarker.isProjectFolder,
      getDocumentLink: (p) => {
        if (p.endsWith("proj")) {
          return { documentId: "doc-123", documentType: "test/type" };
        }
        return undefined;
      },
    };
    const results = scanProjects(tmpDir, scanner);
    expect(results).toHaveLength(1);
    expect(results[0]!.documentId).toBe("doc-123");
    expect(results[0]!.documentType).toBe("test/type");
  });

  it("leaves documentId undefined when getDocumentLink returns undefined", () => {
    mkdir("proj");
    touch("proj", "marker.txt");

    const scanner: ProjectScanner = {
      isProjectFolder: hasMarker.isProjectFolder,
      getDocumentLink: () => undefined,
    };
    const results = scanProjects(tmpDir, scanner);
    expect(results[0]!.documentId).toBeUndefined();
    expect(results[0]!.documentType).toBeUndefined();
  });

  it("leaves documentId undefined when getDocumentLink not provided", () => {
    mkdir("proj");
    touch("proj", "marker.txt");

    const results = scanProjects(tmpDir, hasMarker);
    expect(results[0]!.documentId).toBeUndefined();
  });

  it("handles unreadable directories gracefully", () => {
    mkdir("no-read");
    touch("no-read", "marker.txt");
    // Make a dir that can't be read
    mkdir("unreadable");
    fs.chmodSync(path.join(tmpDir, "unreadable"), 0o000);

    const results = scanProjects(tmpDir, hasMarker);
    expect(results).toHaveLength(1);

    // Restore permissions for cleanup
    fs.chmodSync(path.join(tmpDir, "unreadable"), 0o755);
  });
});

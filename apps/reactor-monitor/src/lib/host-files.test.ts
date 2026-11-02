import { hostExportSchema } from "@powerhousedao/host-core/schema";
import { describe, expect, it } from "vitest";
import { hostExport, stack } from "../host-rules/__fixtures__/hosts.js";
import { changedFiles, hostFiles } from "./host-files.js";

const PREFIX = "export default ";
const SUFFIX = ";\n";

function bodyOf(content: string): unknown {
  expect(content.startsWith(PREFIX)).toBe(true);
  expect(content.endsWith(SUFFIX)).toBe(true);
  return JSON.parse(content.slice(PREFIX.length, -SUFFIX.length));
}

describe("hostFiles", () => {
  it("writes one host.js per folder that rebuilds the export", () => {
    const envelope = hostExport("vetra");
    const files = hostFiles(envelope);
    expect(files.map((file) => file.path)).toEqual([
      "hosts/vetra/host.js",
      ...Object.keys(envelope.members).map(
        (folder) => `hosts/${folder}/host.js`,
      ),
    ]);
    const [own, ...members] = files;
    const rebuilt = {
      ...envelope,
      host: bodyOf(own.content),
      members: Object.fromEntries(
        members.map((file) => [file.folder, bodyOf(file.content)]),
      ),
    };
    expect(hostExportSchema.parse(rebuilt)).toEqual(envelope);
  });

  it("names the files a set of setters writes to", () => {
    const envelope = stack();
    expect(changedFiles(envelope, [])).toEqual([]);
    expect(
      changedFiles(envelope, [
        { path: "host.name", value: "x" },
        { path: "members.switchboard.runner.dev", value: true },
        { path: "members.switchboard.runner.port", value: 0 },
      ]).map((file) => file.path),
    ).toEqual(["hosts/stack/host.js", "hosts/switchboard/host.js"]);
  });
});

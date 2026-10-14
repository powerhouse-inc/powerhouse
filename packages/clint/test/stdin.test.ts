import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { createStdinLineReader } from "../src/core/stdin.js";

describe("createStdinLineReader", () => {
  it("yields lines from a readable stream", async () => {
    const input = new Readable({
      read() {
        this.push("/help\n");
        this.push("/greet --name Alice\n");
        this.push("/exit\n");
        this.push(null);
      },
    });

    const lines: string[] = [];
    for await (const line of createStdinLineReader(input)) {
      lines.push(line);
    }

    expect(lines).toEqual(["/help", "/greet --name Alice", "/exit"]);
  });

  it("handles empty input", async () => {
    const input = new Readable({
      read() {
        this.push(null);
      },
    });

    const lines: string[] = [];
    for await (const line of createStdinLineReader(input)) {
      lines.push(line);
    }

    expect(lines).toEqual([]);
  });

  it("handles input without trailing newline", async () => {
    const input = new Readable({
      read() {
        this.push("/help");
        this.push(null);
      },
    });

    const lines: string[] = [];
    for await (const line of createStdinLineReader(input)) {
      lines.push(line);
    }

    expect(lines).toEqual(["/help"]);
  });
});

import { describe, it, expect } from "vitest";
import { parseReplInput, tokenizeArgs } from "../src/interactive/router.js";

describe("parseReplInput", () => {
  const commandIds = ["greet", "list", "add", "done"];

  it("parses empty input", () => {
    expect(parseReplInput("", commandIds)).toEqual({ type: "empty", raw: "" });
    expect(parseReplInput("   ", commandIds)).toEqual({
      type: "empty",
      raw: "",
    });
  });

  it("parses /cli-docs as a regular command", () => {
    const idsWithCliDocs = [...commandIds, "cli-docs"];
    expect(parseReplInput("/cli-docs", idsWithCliDocs)).toEqual({
      type: "command",
      commandId: "cli-docs",
      args: [],
      raw: "/cli-docs",
    });
    expect(parseReplInput("/cli-docs --command greet", idsWithCliDocs)).toEqual(
      {
        type: "command",
        commandId: "cli-docs",
        args: ["--command", "greet"],
        raw: "/cli-docs --command greet",
      },
    );
  });

  it("parses /exit and /quit", () => {
    expect(parseReplInput("/exit", commandIds)).toEqual({
      type: "exit",
      raw: "/exit",
    });
    expect(parseReplInput("/quit", commandIds)).toEqual({
      type: "exit",
      raw: "/quit",
    });
  });

  it("parses a known command without args", () => {
    expect(parseReplInput("/list", commandIds)).toEqual({
      type: "command",
      commandId: "list",
      args: [],
      raw: "/list",
    });
  });

  it("parses a known command with args", () => {
    expect(parseReplInput("/greet --name Alice", commandIds)).toEqual({
      type: "command",
      commandId: "greet",
      args: ["--name", "Alice"],
      raw: "/greet --name Alice",
    });
  });

  it("parses a command with quoted args", () => {
    expect(parseReplInput('/add --title "Hello World"', commandIds)).toEqual({
      type: "command",
      commandId: "add",
      args: ["--title", "Hello World"],
      raw: '/add --title "Hello World"',
    });
  });

  it("returns unknown for unrecognized command", () => {
    expect(parseReplInput("/foo", commandIds)).toEqual({
      type: "unknown",
      commandId: "foo",
      raw: "/foo",
    });
  });

  it("returns unknown for bare text (no / prefix)", () => {
    expect(parseReplInput("hello world", commandIds)).toEqual({
      type: "unknown",
      raw: "hello world",
    });
  });

  it("returns text for bare text when hasDefaultCommand is true", () => {
    expect(parseReplInput("hello world", commandIds, true)).toEqual({
      type: "text",
      raw: "hello world",
    });
  });

  it("still returns unknown for bare text when hasDefaultCommand is false", () => {
    expect(parseReplInput("hello world", commandIds, false)).toEqual({
      type: "unknown",
      raw: "hello world",
    });
  });

  it("trims whitespace from input", () => {
    expect(parseReplInput("  /list  ", commandIds)).toEqual({
      type: "command",
      commandId: "list",
      args: [],
      raw: "/list",
    });
  });

  it('returns unknown for bare "/" input (regex requires at least one non-space char)', () => {
    expect(parseReplInput("/", commandIds)).toEqual({
      type: "unknown",
      raw: "/",
    });
  });
});

describe("tokenizeArgs", () => {
  it("splits simple args", () => {
    expect(tokenizeArgs("--name Alice")).toEqual(["--name", "Alice"]);
  });

  it("handles double-quoted values", () => {
    expect(tokenizeArgs('--title "Hello World" --priority high')).toEqual([
      "--title",
      "Hello World",
      "--priority",
      "high",
    ]);
  });

  it("handles single-quoted values", () => {
    expect(tokenizeArgs("--title 'Hello World'")).toEqual([
      "--title",
      "Hello World",
    ]);
  });

  it("handles empty string", () => {
    expect(tokenizeArgs("")).toEqual([]);
  });

  it("handles multiple spaces between args", () => {
    expect(tokenizeArgs("--name   Alice")).toEqual(["--name", "Alice"]);
  });

  it("handles tabs", () => {
    expect(tokenizeArgs("--name\tAlice")).toEqual(["--name", "Alice"]);
  });
});

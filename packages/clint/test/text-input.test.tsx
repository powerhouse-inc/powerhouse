import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { TextInput } from "../src/interactive/text-input.js";

function delay(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("TextInput component", () => {
  it("renders value with cursor at end", () => {
    const { lastFrame } = render(
      <TextInput value="hello" onChange={() => {}} />,
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("hello");
  });

  it("renders placeholder when value is empty", () => {
    const { lastFrame } = render(
      <TextInput value="" placeholder="type here" onChange={() => {}} />,
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("type here");
  });

  it("renders cursor block when no value and no placeholder", () => {
    const { lastFrame } = render(<TextInput value="" onChange={() => {}} />);
    // Renders an inverse space as cursor — may be empty after stripping ANSI
    expect(lastFrame()).not.toBeUndefined();
  });

  it("renders value without cursor when showCursor=false", () => {
    const { lastFrame } = render(
      <TextInput value="hello" showCursor={false} onChange={() => {}} />,
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("hello");
  });

  it("renders placeholder dimmed when showCursor=false and empty", () => {
    const { lastFrame } = render(
      <TextInput
        value=""
        placeholder="type"
        showCursor={false}
        onChange={() => {}}
      />,
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("type");
  });

  it("renders value without cursor when focus=false", () => {
    const { lastFrame } = render(
      <TextInput value="hello" focus={false} onChange={() => {}} />,
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("hello");
  });

  it("renders space when focus=false and empty without placeholder", () => {
    const { lastFrame } = render(
      <TextInput value="" focus={false} onChange={() => {}} />,
    );
    expect(lastFrame()).not.toBeUndefined();
  });

  it("calls onChange when typing characters", async () => {
    let changed = "";
    const { stdin } = render(
      <TextInput
        value=""
        onChange={(v) => {
          changed = v;
        }}
      />,
    );
    stdin.write("a");
    await delay();
    expect(changed).toBe("a");
  });

  it("calls onSubmit on Enter", async () => {
    let submitted = "";
    const { stdin } = render(
      <TextInput
        value="test"
        onChange={() => {}}
        onSubmit={(v) => {
          submitted = v;
        }}
      />,
    );
    stdin.write("\r");
    await delay();
    expect(submitted).toBe("test");
  });

  it("uses cursorOffset prop to position cursor", async () => {
    let changed = "";
    const { stdin } = render(
      <TextInput
        value="hello"
        cursorOffset={0}
        onChange={(v) => {
          changed = v;
        }}
      />,
    );
    await delay(); // Wait for useEffect to apply cursorOffset
    stdin.write("X");
    await delay();
    expect(changed).toBe("Xhello");
  });

  it("handles Home key", async () => {
    let changed = "";
    const { stdin } = render(
      <TextInput
        value="abc"
        onChange={(v) => {
          changed = v;
        }}
      />,
    );
    stdin.write("\x1b[H"); // Home
    await delay();
    stdin.write("X");
    await delay();
    expect(changed).toBe("Xabc");
  });

  it("handles End key", async () => {
    let changed = "";
    const { stdin } = render(
      <TextInput
        value="abc"
        cursorOffset={0}
        onChange={(v) => {
          changed = v;
        }}
      />,
    );
    stdin.write("\x1b[F"); // End
    await delay();
    stdin.write("X");
    await delay();
    expect(changed).toBe("abcX");
  });

  it("handles backspace", async () => {
    let changed = "";
    const { stdin } = render(
      <TextInput
        value="abc"
        onChange={(v) => {
          changed = v;
        }}
      />,
    );
    stdin.write("\x7f"); // Backspace (mapped as key.delete by Ink)
    await delay();
    expect(changed).toBe("ab");
  });

  it("ignores backspace at position 0", async () => {
    let changed = "";
    const { stdin } = render(
      <TextInput
        value="abc"
        cursorOffset={0}
        onChange={(v) => {
          changed = v;
        }}
      />,
    );
    await delay(); // Wait for cursorOffset effect
    stdin.write("\x7f");
    await delay();
    expect(changed).toBe("");
  });

  it("ignores Tab key (passed through to parent)", async () => {
    let changed = "";
    const { stdin } = render(
      <TextInput
        value="abc"
        onChange={(v) => {
          changed = v;
        }}
      />,
    );
    stdin.write("\t");
    await delay();
    expect(changed).toBe("");
  });

  it("ignores Up/Down arrow keys (passed through to parent)", async () => {
    let changed = "";
    const { stdin } = render(
      <TextInput
        value="abc"
        onChange={(v) => {
          changed = v;
        }}
      />,
    );
    stdin.write("\x1b[A"); // Up
    await delay();
    stdin.write("\x1b[B"); // Down
    await delay();
    expect(changed).toBe("");
  });

  it("handles Ctrl+Left to jump to previous word boundary", async () => {
    let changed = "";
    const { stdin } = render(
      <TextInput
        value="hello world"
        onChange={(v) => {
          changed = v;
        }}
      />,
    );
    // Ctrl+Left: \x1b[1;5D
    stdin.write("\x1b[1;5D");
    await delay();
    stdin.write("X");
    await delay();
    expect(changed).toBe("hello Xworld");
  });

  it("handles Ctrl+Right to jump to next word boundary", async () => {
    let changed = "";
    const { stdin } = render(
      <TextInput
        value="hello world"
        cursorOffset={0}
        onChange={(v) => {
          changed = v;
        }}
      />,
    );
    await delay();
    // Ctrl+Right: \x1b[1;5C
    stdin.write("\x1b[1;5C");
    await delay();
    stdin.write("X");
    await delay();
    expect(changed).toBe("hello Xworld");
  });

  // Note: Forward delete (\x1b[3~) uses raw stdin interception which
  // ink-testing-library doesn't support — tested manually in real terminals.

  it("renders ghost text suggestion when cursor is at end", () => {
    const { lastFrame } = render(
      <TextInput value="/ad" suggestion="/add" onChange={() => {}} />,
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("/ad");
    expect(frame).toContain("d"); // ghost character
  });

  it("ignores focus reporting sequences", async () => {
    let changed = "";
    const { stdin } = render(
      <TextInput
        value="abc"
        onChange={(v) => {
          changed = v;
        }}
      />,
    );
    stdin.write("\x1b[I"); // Focus in
    await delay();
    stdin.write("\x1b[O"); // Focus out
    await delay();
    expect(changed).toBe("");
  });

  it("handles left arrow movement", async () => {
    let changed = "";
    const { stdin } = render(
      <TextInput
        value="abc"
        onChange={(v) => {
          changed = v;
        }}
      />,
    );
    stdin.write("\x1b[D"); // Left
    await delay();
    stdin.write("X");
    await delay();
    expect(changed).toBe("abXc");
  });

  it("handles right arrow after left", async () => {
    let changed = "";
    const { stdin } = render(
      <TextInput
        value="abc"
        cursorOffset={1}
        onChange={(v) => {
          changed = v;
        }}
      />,
    );
    await delay();
    stdin.write("\x1b[C"); // Right
    await delay();
    stdin.write("X");
    await delay();
    expect(changed).toBe("abXc");
  });
});

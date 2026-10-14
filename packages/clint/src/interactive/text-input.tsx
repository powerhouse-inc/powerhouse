import React, { useState, useEffect, useRef } from "react";
import { Text, useInput, useStdin } from "ink";

/** Test whether a character is a word boundary (whitespace). */
const isWordBoundary = (ch: string) => ch === " " || ch === "\n" || ch === "\t";

export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  focus?: boolean;
  showCursor?: boolean;
  /** When set, moves cursor to this offset. */
  cursorOffset?: number;
  /** Inline ghost text shown after the cursor (e.g. completion preview). */
  suggestion?: string;
}

/**
 * Controlled text input with external cursor positioning.
 *
 * Based on ink-text-input but adds a `cursorOffset` prop so that
 * tab-completion and other programmatic value changes can move
 * the cursor to the correct position.
 *
 * Uses Ink's `<Text>` with `inverse` for cursor rendering instead of chalk,
 * so no extra dependencies are needed.
 */
export function TextInput({
  value: originalValue,
  placeholder = "",
  focus = true,
  showCursor = true,
  cursorOffset: externalCursorOffset,
  suggestion = "",
  onChange,
  onSubmit,
}: TextInputProps) {
  const [internalOffset, setInternalOffset] = useState(
    (originalValue || "").length,
  );

  // Apply external cursor offset when provided
  useEffect(() => {
    if (externalCursorOffset !== undefined) {
      setInternalOffset(externalCursorOffset);
    }
  }, [externalCursorOffset]);

  // Clamp cursor when value shrinks
  useEffect(() => {
    const len = (originalValue || "").length;
    setInternalOffset((prev) => (prev > len ? len : prev));
  }, [originalValue]);

  const cursorOffset = internalOffset;

  // Track raw stdin sequences that Ink can't distinguish:
  // - Delete (\x1b[3~) vs Backspace (\x7f): both map to key.delete
  // - Ctrl+Backspace (\x17 = Ctrl+W): Ink sees as input='w', ctrl=true
  // - Ctrl+Delete (\x1b[3;5~): Ink may not parse the modifier
  const { stdin } = useStdin();
  const isForwardDelete = useRef(false);
  const isCtrlBackspace = useRef(false);
  const isCtrlDelete = useRef(false);
  useEffect(() => {
    const onData = (data: Buffer) => {
      const s = data.toString();

      isForwardDelete.current = s === "\x1b[3~" || s === "\x1b[3;5~";
      isCtrlBackspace.current = s === "\x17"; // Ctrl+W = Ctrl+Backspace
      isCtrlDelete.current = s === "\x1b[3;5~" || s === "\x1bd"; // ESC+d = Ctrl+Delete
    };
    stdin.on("data", onData);
    return () => {
      stdin.off("data", onData);
    };
  }, [stdin]);

  useInput(
    (input, key) => {
      // Ignore terminal focus reporting sequences
      if (
        input === "[I" ||
        input === "[O" ||
        (key.escape && (input === "I" || input === "O"))
      ) {
        return;
      }

      // Pass through keys handled by parent (Ctrl+C, Tab)
      if ((key.ctrl && input === "c") || key.tab || (key.shift && key.tab)) {
        return;
      }

      // Ctrl+Backspace (\x17): Ink sees as ctrl+w — intercept for word delete
      if (isCtrlBackspace.current) {
        isCtrlBackspace.current = false;
        if (cursorOffset > 0) {
          let i = cursorOffset - 1;
          while (i > 0 && isWordBoundary(originalValue[i - 1]!)) i--;
          while (i > 0 && !isWordBoundary(originalValue[i - 1]!)) i--;
          const nextValue =
            originalValue.slice(0, i) + originalValue.slice(cursorOffset);
          setInternalOffset(i);
          if (nextValue !== originalValue) onChange(nextValue);
        }
        return;
      }

      // Ctrl+Delete (\x1b[3;5~): Ink may misparse — intercept for word delete
      if (isCtrlDelete.current) {
        isCtrlDelete.current = false;
        if (cursorOffset < originalValue.length) {
          let i = cursorOffset;
          while (i < originalValue.length && isWordBoundary(originalValue[i]!))
            i++;
          while (i < originalValue.length && !isWordBoundary(originalValue[i]!))
            i++;
          const nextValue =
            originalValue.slice(0, cursorOffset) + originalValue.slice(i);
          if (nextValue !== originalValue) onChange(nextValue);
        }
        return;
      }

      // Up/Down: navigate lines within multi-line input, or pass through to parent
      if (key.upArrow || key.downArrow) {
        const lines = originalValue.split("\n");
        if (lines.length <= 1) return; // single-line — let parent handle

        // Find which line the cursor is on and column within that line
        let charCount = 0;
        let cursorLine = 0;
        for (let i = 0; i < lines.length; i++) {
          if (cursorOffset <= charCount + lines[i]!.length) {
            cursorLine = i;
            break;
          }
          charCount += lines[i]!.length + 1; // +1 for '\n'
        }
        const colInLine = cursorOffset - charCount;

        if (key.upArrow) {
          if (cursorLine === 0) return; // top line — pass through to parent
          // Move to same column on previous line (clamped)
          const prevLineStart = charCount - lines[cursorLine - 1]!.length - 1;
          const newCol = Math.min(colInLine, lines[cursorLine - 1]!.length);
          setInternalOffset(prevLineStart + newCol);
        } else {
          if (cursorLine === lines.length - 1) return; // bottom line — pass through
          // Move to same column on next line (clamped)
          const nextLineStart = charCount + lines[cursorLine]!.length + 1;
          const newCol = Math.min(colInLine, lines[cursorLine + 1]!.length);
          setInternalOffset(nextLineStart + newCol);
        }
        return;
      }

      if (key.return) {
        // Alt+Enter or Shift+Enter (Kitty protocol): insert newline
        if (key.meta || key.shift) {
          const nextVal =
            originalValue.slice(0, cursorOffset) +
            "\n" +
            originalValue.slice(cursorOffset);
          setInternalOffset(cursorOffset + 1);
          onChange(nextVal);
          return;
        }
        onSubmit?.(originalValue);
        return;
      }

      let nextOffset = cursorOffset;
      let nextValue = originalValue;

      if (key.home) {
        nextOffset = 0;
      } else if (key.end) {
        nextOffset = originalValue.length;
      } else if (key.leftArrow) {
        if (showCursor) {
          if (key.ctrl) {
            // Jump to previous word boundary
            let i = cursorOffset - 1;
            while (i > 0 && isWordBoundary(originalValue[i - 1]!)) i--;
            while (i > 0 && !isWordBoundary(originalValue[i - 1]!)) i--;
            nextOffset = i;
          } else {
            nextOffset--;
          }
        }
      } else if (key.rightArrow) {
        if (showCursor) {
          if (key.ctrl) {
            // Jump to next word boundary
            let i = cursorOffset;
            while (
              i < originalValue.length &&
              !isWordBoundary(originalValue[i]!)
            )
              i++;
            while (
              i < originalValue.length &&
              isWordBoundary(originalValue[i]!)
            )
              i++;
            nextOffset = i;
          } else {
            nextOffset++;
          }
        }
      } else if ((key.delete || key.backspace) && isForwardDelete.current) {
        // Physical Delete key (\x1b[3~): forward delete single char
        if (cursorOffset < originalValue.length) {
          nextValue =
            originalValue.slice(0, cursorOffset) +
            originalValue.slice(cursorOffset + 1);
        }
      } else if (key.delete || key.backspace) {
        // Physical Backspace (\x7f) or Ctrl+H (\b): backward delete single char
        if (cursorOffset > 0) {
          nextValue =
            originalValue.slice(0, cursorOffset - 1) +
            originalValue.slice(cursorOffset);
          nextOffset--;
        }
      } else {
        nextValue =
          originalValue.slice(0, cursorOffset) +
          input +
          originalValue.slice(cursorOffset);
        nextOffset += input.length;
      }

      // Clamp
      if (nextOffset < 0) nextOffset = 0;
      if (nextOffset > nextValue.length) nextOffset = nextValue.length;

      setInternalOffset(nextOffset);
      if (nextValue !== originalValue) {
        onChange(nextValue);
      }
    },
    { isActive: focus },
  );

  // Render value with cursor
  if (!showCursor || !focus) {
    if (originalValue.length > 0) {
      return <Text>{originalValue}</Text>;
    }
    return placeholder ? <Text dimColor>{placeholder}</Text> : <Text> </Text>;
  }

  // Empty value — show placeholder with cursor on first char
  if (originalValue.length === 0) {
    if (placeholder) {
      return (
        <Text>
          <Text inverse>{placeholder[0]}</Text>
          <Text dimColor>{placeholder.slice(1)}</Text>
        </Text>
      );
    }
    return <Text inverse> </Text>;
  }

  // Value with cursor
  const before = originalValue.slice(0, cursorOffset);
  const atEnd = cursorOffset >= originalValue.length;

  // Ghost text: show suggestion suffix when cursor is at end
  if (atEnd && suggestion) {
    const ghost = suggestion.slice(originalValue.length);
    if (ghost.length > 0) {
      return (
        <Text>
          {before}
          <Text dimColor inverse>
            {ghost[0]}
          </Text>
          <Text dimColor>{ghost.slice(1)}</Text>
        </Text>
      );
    }
  }

  const rawChar = !atEnd ? originalValue[cursorOffset]! : " ";
  const after = !atEnd ? originalValue.slice(cursorOffset + 1) : "";
  // Newline under cursor: show visible inverse space, then the line break
  const cursorChar = rawChar === "\n" ? " " : rawChar;
  const cursorTrail = rawChar === "\n" ? "\n" : "";

  return (
    <Text>
      {before}
      <Text inverse>{cursorChar}</Text>
      {cursorTrail}
      {after}
    </Text>
  );
}

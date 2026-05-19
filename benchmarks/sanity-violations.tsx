// Sanity test file: each block triggers a specific rule that used to be
// caught by the old ESLint config. Run with:
//   node_modules/.bin/oxlint --type-aware benchmarks/sanity-violations.tsx
// Expected: every section produces a diagnostic.

import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// 1. @typescript-eslint/no-floating-promises  (type-aware)
// ---------------------------------------------------------------------------
async function makeRequest(): Promise<string> {
  return "ok";
}
function caller1() {
  makeRequest(); // floating promise — was: error in old ESLint
}

// ---------------------------------------------------------------------------
// 2. @typescript-eslint/require-await  (type-aware)
// ---------------------------------------------------------------------------
async function notReallyAsync() {
  return 42; // no await — was: warning in old ESLint
}

// ---------------------------------------------------------------------------
// 3. @typescript-eslint/no-unnecessary-condition  (type-aware)
// ---------------------------------------------------------------------------
function checker(x: string) {
  if (x) return 1; // always truthy when typed string
  return 0;
}

// ---------------------------------------------------------------------------
// 4. no-unsafe-optional-chaining
// ---------------------------------------------------------------------------
function unsafe(obj?: { count: number }) {
  return obj?.count + 1; // optional chain in arithmetic
}

// ---------------------------------------------------------------------------
// 5. react-hooks/rules-of-hooks
// ---------------------------------------------------------------------------
function MyComponent({ when }: { when: boolean }) {
  if (when) {
    const [n] = useState(0); // hook inside a condition
    return <div>{n}</div>;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 6. react-hooks/exhaustive-deps
// ---------------------------------------------------------------------------
function Watcher({ id }: { id: number }) {
  useEffect(() => {
    console.log(id); // uses `id` but deps is []
  }, []);
  return null;
}

// ---------------------------------------------------------------------------
// 7. logger/missing-token-args  (custom plugin via jsPlugins)
// ---------------------------------------------------------------------------
const myLogger = { error: (..._args: unknown[]) => {} };
function logSomething() {
  myLogger.error("User @userId did @action"); // 2 tokens, 0 args
}

// ---------------------------------------------------------------------------
// 8. @typescript-eslint/consistent-type-imports
// ---------------------------------------------------------------------------
import { type Dispatch, SetStateAction } from "react"; // mixed; should be separate

// ---------------------------------------------------------------------------
// 9. no-unused-vars
// ---------------------------------------------------------------------------
const definitelyUnused = "leftover";

// ---------------------------------------------------------------------------
// 10. no-useless-assignment  (nursery rule we enabled)
// ---------------------------------------------------------------------------
function leaks() {
  let v = 1;
  v = 2; // overwritten before read
  return v + 1;
}

// ---------------------------------------------------------------------------
// 11. tailwindcss/no-unknown-classes  (native tailwind plugin)
// ---------------------------------------------------------------------------
function StyledButton() {
  return <button className="bg-blue-500 not-a-real-tw-class" />;
}

// Keep symbols referenced so TS does not strip them entirely
export { caller1, notReallyAsync, checker, unsafe, MyComponent, Watcher, logSomething, leaks, StyledButton };
export type _Reexport = Dispatch<SetStateAction<number>>;

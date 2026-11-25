// Loaded with `node --import` ahead of `ph-run`: the ink shell opens only when
// stdin is a terminal, and a test on Windows has no pseudo-terminal to give
// it. A piped stdin marked as one is what cli.run and Ink read: `isTTY`, and
// a raw mode that a pipe does not need.
process.stdin.isTTY = true;
process.stdin.setRawMode = function setRawMode() {
  return this;
};

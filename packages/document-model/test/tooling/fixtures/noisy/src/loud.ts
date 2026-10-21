/**
 * A definition source that writes to stdout and then fails.
 *
 * Ordinary TypeScript may log — a source can import a library that announces
 * itself. With `--json` the command's stdout belongs to exactly one report, so
 * this is what proves the log lands on stderr instead of between the shell and
 * the JSON an agent is parsing.
 */
process.stdout.write(
  "this source writes to stdout while it is being evaluated\n",
);
console.log("and it uses console.log too");
throw new Error("and then it fails");

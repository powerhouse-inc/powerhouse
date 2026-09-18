// A check runner small enough to read in a CI log: one line per assertion, the
// failures repeated at the end so the first screen of the tail names them.

export interface CheckFailure {
  name: string;
  detail: string;
}

export class Checks {
  private readonly failures: CheckFailure[] = [];

  private passed = 0;

  ok(name: string, condition: boolean, detail: () => string): void {
    if (condition) {
      this.passed += 1;
      console.log(`  ✓ ${name}`);
      return;
    }
    const message = detail();
    this.failures.push({ name, detail: message });
    console.log(`  ✗ ${name}\n      ${message}`);
  }

  equal(name: string, actual: unknown, expected: unknown): void {
    this.ok(
      name,
      JSON.stringify(actual) === JSON.stringify(expected),
      () =>
        `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }

  // Throws on the first failure list, so the orchestrator's exit code and the
  // log agree about which assertions went wrong.
  report(): void {
    console.log(
      `\n${this.passed} check(s) passed, ${this.failures.length} failed`,
    );
    if (this.failures.length === 0) return;
    const lines = this.failures.map((f) => `  ✗ ${f.name}: ${f.detail}`);
    throw new Error(`Failed checks:\n${lines.join("\n")}`);
  }
}

export function matchesScalarPattern(pattern: RegExp, value: unknown): boolean {
  return Reflect.apply(pattern.test.bind(pattern), undefined, [value]) === true;
}

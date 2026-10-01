import { GraphQLError } from "graphql";

/** A renamed argument given under both names, or a required one under neither. */
export class ArgumentAliasError extends GraphQLError {
  constructor(message: string) {
    super(message, { extensions: { code: "BAD_USER_INPUT" } });
  }
}

/** The value of a required argument that may still arrive under its old name. */
export function requireOneOf<T>(
  args: Record<string, unknown>,
  name: string,
  deprecatedName: string,
): T {
  const current = args[name] ?? undefined;
  const deprecated = args[deprecatedName] ?? undefined;
  if (current !== undefined && deprecated !== undefined) {
    throw new ArgumentAliasError(
      `Pass ${name} or ${deprecatedName}, not both.`,
    );
  }
  if (current === undefined && deprecated === undefined) {
    throw new ArgumentAliasError(`${name} is required.`);
  }
  return (current ?? deprecated) as T;
}

/** The value of an optional argument that may still arrive under its old name. */
export function optionalOneOf<T>(
  args: Record<string, unknown>,
  name: string,
  deprecatedName: string,
): T | undefined {
  const current = args[name] ?? undefined;
  const deprecated = args[deprecatedName] ?? undefined;
  if (current !== undefined && deprecated !== undefined) {
    throw new ArgumentAliasError(
      `Pass ${name} or ${deprecatedName}, not both.`,
    );
  }
  return (current ?? deprecated) as T | undefined;
}

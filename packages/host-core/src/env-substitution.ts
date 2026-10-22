/**
 * Pure built-in `$env` substitution: the `"${userData}"` / `"${projectRoot}"`
 * string sugar, deep-applied to a JSON-shaped value. No node imports, so it
 * ships in `./schema`; the node default for userData is placeholders.ts.
 */

export interface BuiltinEnv {
  userData?: string;
  projectRoot?: string;
}

const BUILTIN = /\$\{(userData|projectRoot)\}/g;

function substitute(text: string, env: BuiltinEnv): string {
  return text.replace(
    BUILTIN,
    (match, name: keyof BuiltinEnv) => env[name] ?? match,
  );
}

/** Deep-substitute the built-ins that `env` provides in every string; an
 * absent built-in is left as written. The input is never mutated. */
export function substituteBuiltinEnv<T>(value: T, env: BuiltinEnv): T {
  return substituteValue(value, env) as T;
}

function substituteValue(value: unknown, env: BuiltinEnv): unknown {
  if (typeof value === "string") return substitute(value, env);
  if (Array.isArray(value)) return value.map((v) => substituteValue(v, env));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = substituteValue(v, env);
    }
    return out;
  }
  return value;
}

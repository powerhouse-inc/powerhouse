import { sha256 } from "@noble/hashes/sha2.js";
import { z } from "zod";
import { canonicalJson } from "./action-signature.js";
import { assertValidInitialGrants, GrantSchema } from "./auth-v1.js";
import type {
  Sha256Digest,
  InitialAuthTemplateGrant,
  InitialAuthTemplate,
  InitialAuthTemplateBody,
} from "./definition-types.js";
export type {
  InitialAuthBindingDefinition,
  InitialAuthBindingSource,
  InitialAuthTemplateGrant,
  InitialAuthTemplate,
  InitialAuthTemplateBody,
} from "./definition-types.js";
import type { Grant, PHAuthState } from "./state.js";

export type AuthAddress = string & { readonly __brand: "AuthAddress" };
export type AuthGroupId = string & { readonly __brand: "AuthGroupId" };

function identityString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    ![...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  );
}

export function isAuthAddress(value: unknown): value is AuthAddress {
  return identityString(value);
}

export function isAuthGroupId(value: unknown): value is AuthGroupId {
  return identityString(value);
}

/** Validates representation only; the host must authorize assigning this identity. */
export function authAddress(value: unknown): AuthAddress {
  if (!isAuthAddress(value))
    throw new InitialAuthError(
      "invalid-binding",
      "An address must be a nonempty identity without surrounding whitespace or control characters.",
    );
  return value;
}

/** Validates representation only; the host must verify the referenced group. */
export function authGroupId(value: unknown): AuthGroupId {
  if (!isAuthGroupId(value))
    throw new InitialAuthError(
      "invalid-binding",
      "A group ID must be nonempty and contain no surrounding whitespace or control characters.",
    );
  return value;
}

export class InitialAuthError extends Error {
  constructor(
    readonly code:
      | "invalid-template"
      | "invalid-binding"
      | "unresolved-binding",
    message: string,
  ) {
    super(message);
    this.name = "InitialAuthError";
  }
}

const BindingSchema = z
  .object({
    kind: z.enum(["address", "group"]),
    source: z.enum(["deployment", "instance"]),
  })
  .strict();

const BindingPrincipalSchema = z
  .object({ binding: z.string().min(1) })
  .strict();

function templateGrant(value: unknown): value is InitialAuthTemplateGrant {
  if (typeof value !== "object" || value === null || !("principal" in value))
    return false;
  const binding = BindingPrincipalSchema.safeParse(value.principal);
  return GrantSchema().safeParse(
    binding.success
      ? { ...value, principal: { address: binding.data.binding } }
      : value,
  ).success;
}

const TemplateBodySchema = z
  .object({
    version: z.literal(1),
    bindings: z.record(
      z
        .string()
        .regex(/^[A-Za-z_][A-Za-z0-9_]*$/u)
        .refine(
          (key) => !["__proto__", "constructor", "prototype"].includes(key),
        ),
      BindingSchema,
    ),
    grants: z.array(z.custom<InitialAuthTemplateGrant>(templateGrant)),
  })
  .strict();
const TemplateSchema = TemplateBodySchema.extend({
  digest: z.templateLiteral(["sha256:", z.string().regex(/^[a-f0-9]{64}$/u)]),
});
export type ResolvedInitialAuthBindings = {
  readonly deployment: Readonly<Record<string, AuthAddress | AuthGroupId>>;
  readonly instance: Readonly<Record<string, AuthAddress | AuthGroupId>>;
};

/** Canonical ordered-policy digest, shared by authoring and creation admission. */
export function initialAuthDigest(value: unknown): Sha256Digest {
  const bytes = sha256(
    new TextEncoder().encode(canonicalJson(value, "initial authorization")),
  );
  return `sha256:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function freezeTemplate<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) freezeTemplate(child);
    Object.freeze(value);
  }
  return value;
}

function substitute(
  template: InitialAuthTemplateBody,
  values: Readonly<Record<string, string | undefined>>,
): Grant[] {
  return template.grants.map((grant) => {
    if (!("binding" in grant.principal))
      return structuredClone({ ...grant, principal: grant.principal });
    const key = grant.principal.binding;
    const declaration = Object.hasOwn(template.bindings, key)
      ? template.bindings[key]
      : undefined;
    if (!declaration)
      throw new InitialAuthError(
        "invalid-template",
        `Unknown principal binding ${JSON.stringify(key)}.`,
      );
    const value = values[key];
    if (value === undefined)
      throw new InitialAuthError(
        "unresolved-binding",
        `Missing principal binding ${JSON.stringify(key)}.`,
      );
    return {
      ...structuredClone(grant),
      principal:
        declaration.kind === "address" ? { address: value } : { group: value },
    };
  });
}

export function compileInitialAuthTemplate(
  value: unknown,
  documentType: string,
): InitialAuthTemplate {
  const parsed = TemplateBodySchema.safeParse(value);
  if (!parsed.success)
    throw new InitialAuthError(
      "invalid-template",
      "The initial authorization template is malformed.",
    );
  const body = structuredClone(parsed.data);
  const ids = new Set<string>();
  for (const grant of body.grants) {
    if (ids.has(grant.id))
      throw new InitialAuthError(
        "invalid-template",
        `Duplicate grant ID ${JSON.stringify(grant.id)}.`,
      );
    ids.add(grant.id);
  }
  const literalIdentities = new Set(
    body.grants
      .flatMap(({ principal }) =>
        "address" in principal
          ? [principal.address]
          : "group" in principal
            ? [principal.group]
            : [],
      )
      .map((identity) => identity.toLowerCase()),
  );
  const placeholders = Object.fromEntries(
    Object.entries(body.bindings).map(([key, binding]) => {
      let identity = `binding:${binding.kind}:${key}`;
      while (literalIdentities.has(identity.toLowerCase())) identity += ":";
      literalIdentities.add(identity.toLowerCase());
      return [key, identity];
    }),
  );
  assertValidInitialGrants(
    substitute(body, placeholders),
    documentType,
    undefined,
  );
  return freezeTemplate({ ...body, digest: initialAuthDigest(body) });
}

export function parseInitialAuthTemplate(
  value: unknown,
  documentType: string,
): InitialAuthTemplate {
  const parsed = TemplateSchema.safeParse(value);
  if (!parsed.success)
    throw new InitialAuthError(
      "invalid-template",
      "The initial authorization template is malformed.",
    );
  const { digest, ...body } = parsed.data;
  const compiled = compileInitialAuthTemplate(body, documentType);
  if (digest !== compiled.digest)
    throw new InitialAuthError(
      "invalid-template",
      "The initial authorization template digest does not match its contents.",
    );
  return compiled;
}

/** Resolves data only. Calling this does not authorize creation or attest bindings. */
export function resolveInitialAuthTemplate(
  templateValue: unknown,
  bindingsValue: unknown,
  documentType: string,
): PHAuthState {
  const template = parseInitialAuthTemplate(templateValue, documentType);
  const parsed = z
    .object({
      deployment: z.record(z.string(), z.unknown()),
      instance: z.record(z.string(), z.unknown()),
    })
    .strict()
    .safeParse(bindingsValue);
  if (!parsed.success)
    throw new InitialAuthError(
      "invalid-binding",
      "Bindings require deployment and instance maps.",
    );
  const values: Record<string, string> = {};
  Object.setPrototypeOf(values, null);
  for (const source of ["deployment", "instance"] as const) {
    for (const key of Object.keys(parsed.data[source])) {
      if (
        !Object.hasOwn(template.bindings, key) ||
        template.bindings[key].source !== source
      )
        throw new InitialAuthError(
          "invalid-binding",
          `Unknown ${source} binding ${JSON.stringify(key)}.`,
        );
    }
  }
  for (const [key, binding] of Object.entries(template.bindings)) {
    const source = parsed.data[binding.source];
    if (!Object.hasOwn(source, key))
      throw new InitialAuthError(
        "unresolved-binding",
        `Missing ${binding.source} binding ${JSON.stringify(key)}.`,
      );
    values[key] =
      binding.kind === "address"
        ? authAddress(source[key])
        : authGroupId(source[key]);
  }
  const grants = substitute(template, values);
  assertValidInitialGrants(grants, documentType, undefined);
  return { version: 1, grants };
}

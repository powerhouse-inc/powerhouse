/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  ConnectionAuthType,
  ConnectionState,
  ConnectionStatus,
  RecordCheckResultInput,
  RemoveSecretRefInput,
  SecretRef,
  SetAccountLabelInput,
  SetConfigInput,
  SetConnectionNameInput,
  SetConnectorInput,
  SetSecretRefInput,
} from "./types.js";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export const ConnectionAuthTypeSchema = z.enum([
  "BASIC_AUTH",
  "CUSTOM_AUTH",
  "NONE",
  "OAUTH2",
  "OIDC",
  "SECRET_TEXT",
]);

export const ConnectionStatusSchema = z.enum([
  "ERROR",
  "OK",
  "REVOKED",
  "UNCONFIGURED",
]);

export function ConnectionStateSchema(): z.ZodObject<
  Properties<ConnectionState>
> {
  return z.object({
    __typename: z.literal("ConnectionState").optional(),
    accountLabel: z.string().nullish(),
    authType: ConnectionAuthTypeSchema,
    config: z.unknown(),
    connectorId: z.string(),
    lastCheckedAt: z.iso.datetime().nullish(),
    lastError: z.string().nullish(),
    name: z.string(),
    secretRefs: z.array(z.lazy(() => SecretRefSchema())),
    status: ConnectionStatusSchema,
  });
}

export function RecordCheckResultInputSchema(): z.ZodObject<
  Properties<RecordCheckResultInput>
> {
  return z.object({
    checkedAt: z.iso.datetime(),
    error: z.string().nullish(),
    status: ConnectionStatusSchema,
  });
}

export function RemoveSecretRefInputSchema(): z.ZodObject<
  Properties<RemoveSecretRefInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function SecretRefSchema(): z.ZodObject<Properties<SecretRef>> {
  return z.object({
    __typename: z.literal("SecretRef").optional(),
    id: z.string(),
    name: z.string(),
    ref: z.string(),
  });
}

export function SetAccountLabelInputSchema(): z.ZodObject<
  Properties<SetAccountLabelInput>
> {
  return z.object({
    accountLabel: z.string().nullish(),
  });
}

export function SetConfigInputSchema(): z.ZodObject<
  Properties<SetConfigInput>
> {
  return z.object({
    config: z.unknown(),
  });
}

export function SetConnectionNameInputSchema(): z.ZodObject<
  Properties<SetConnectionNameInput>
> {
  return z.object({
    name: z.string(),
  });
}

export function SetConnectorInputSchema(): z.ZodObject<
  Properties<SetConnectorInput>
> {
  return z.object({
    authType: ConnectionAuthTypeSchema,
    connectorId: z.string(),
  });
}

export function SetSecretRefInputSchema(): z.ZodObject<
  Properties<SetSecretRefInput>
> {
  return z.object({
    id: z.string(),
    name: z.string(),
    ref: z.string(),
  });
}

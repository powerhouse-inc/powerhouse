import { describe, expect, it } from "vitest";
import { compileConsumer } from "../helpers/consumer-project.js";

const consumer = `
import { defineDocumentModel, defineDocumentModelFamily, materialize, ph, authAddress, authGroupId } from "document-model";
import type { InitialAuthBindings } from "document-model";
const Status = ph.enum("Status", { values: ["DRAFT", "LIVE"] });
const model = defineDocumentModel({ id: "consumer/auth", name: "Auth", description: "Auth", extension: "auth", version: 1, author: { name: "A" }, scopes: {
  global: { schema: ph.object("AuthState", { fields: { title: ph.String({ required: true }), status: ph.ref(Status, { required: true }), count: ph.Int({ required: true }), owner: ph.ref(ph.object("Owner", { fields: { address: ph.String({ required: true }) } })) } }), initialValue: { title: "", status: "DRAFT", count: 0, owner: null } },
  local: { schema: ph.object("AuthLocalState", { fields: { note: ph.String() } }), initialValue: { note: null } },
} });
const edits = model.module("edits", { operations: ({ global, local }) => ({
  setTitle: global({ input: ph.input({ fields: { title: ph.String({ required: true }), count: ph.Int({ required: true, defaultValue: 1 }) } }), reduce(state, input) { state.title = input.title; } }),
  publish: global({ input: ph.input({ fields: { status: ph.ref(Status, { required: true }) } }), reduce(state, input) { state.status = input.status; } }),
  draft: local({ input: ph.input({ fields: { note: ph.String() } }), reduce(state, input) { state.note = input.note ?? null; } }),
}) });
const widenedModuleKey: string = "wide";
const widenedOperationKey: string = "edit";
const wideModule = model.module(widenedModuleKey, { operations: ({ global }) => ({ edit: global({ input: ph.input({ fields: {} }), reduce() {} }) }) });
const wideOperation = model.module("wideOperation", { operations: ({ global }) => ({ [widenedOperationKey]: global({ input: ph.input({ fields: {} }), reduce() {} }) }) });
model.version({ modules: [wideModule, wideOperation], auth: ({ operations, platform, policy: p }) => {
  // @ts-expect-error widened module keys cannot create a string-indexed operation catalog
  p.execute(operations.anyModule.edit);
  // @ts-expect-error widened operation keys cannot create a string-indexed operation catalog
  p.execute(operations.wideOperation.anyOperation);
  return p.initial({ version: 1, bindings: p.bindings({}), grants: [p.allow({ id: "admin", description: "Admin", principal: p.anyone(), target: p.execute(platform.auth.setGrant) })] });
} });
export const Version = model.version({ modules: [edits], auth: ({ operations, scopes, platform, policy: p }) => {
  const bindings = p.bindings({ admin: p.addressBinding({ source: "deployment" }), owner: p.addressBinding({ source: "instance" }), company: p.groupBinding({ source: "instance" }) });
  const admin = p.allow({ id: "admin", description: "Admin", principal: bindings.admin, target: p.execute(platform.auth.setGrant) });
  p.allow({ id: "slug", description: "slug", principal: bindings.admin, target: p.execute(platform.header.setSlug), where: context => {
    // @ts-expect-error header operations have no domain state
    p.exists(context.state);
    return p.eq(context.input.slug, "example");
  } });
  p.execute(platform.global.setName);
  p.execute(platform.header.setPreferredEditor);
  // @ts-expect-error genesis is not an authorization target
  p.execute(platform.auth.initializeAuth);
  p.allow({ id: "single", description: "single", principal: bindings.owner, target: p.execute(operations.edits.setTitle), where: ({ state, input, subject }) => {
    p.eq(input.count, 1); p.eq(state.owner.address, subject.address); p.gte(state.count, 0);
    // @ts-expect-error original input may omit the defaulted count
    const count: import("document-model").AuthValue<number> = input.count;
    // @ts-expect-error input has no status
    p.eq(input.status, "DRAFT");
    // @ts-expect-error enums cannot widen from comparison literal
    p.eq(state.status, "DRAFFT");
    // @ts-expect-error no numeric comparison with a boolean
    p.eq(state.count, true);
    // @ts-expect-error object equality is not supported
    p.eq(state.owner, null);
    // @ts-expect-error unknown nested field
    p.exists(state.owner.unknown);
    return p.eq(state.title, input.title);
  } });
  p.allow({ id: "read", description: "read", principal: bindings.owner, target: p.read(scopes.global), where: context => {
    // @ts-expect-error reads have no input
    p.exists(context.input);
    return p.exists(context.subject.address);
  } });
  p.allow({ id: "many", description: "many", principal: bindings.owner, target: p.executeMany([operations.edits.setTitle, operations.edits.publish]), where: context => {
    // @ts-expect-error multi-operation targets have no input
    p.exists(context.input);
    return p.exists(context.subject.address);
  } });
  // @ts-expect-error structural operation objects are not opaque references
  p.execute({ kind: "powerhouse.auth-operation" });
  // @ts-expect-error structural conditions are not condition tokens
  p.not({ kind: "powerhouse.auth-condition" });
  // @ts-expect-error structural scope objects are not references
  p.read({ kind: "powerhouse.auth-scope", scope: "global" });
  // @ts-expect-error operation names are references
  p.execute("SET_TITLE");
  // @ts-expect-error not an operation in selected modules
  p.execute(operations.edits.missing);
  // @ts-expect-error module is not selected
  p.execute(operations.other.setTitle);
  // @ts-expect-error multi-operation target must be nonempty
  p.executeMany([]);
  // @ts-expect-error operations must share a scope
  p.executeMany([operations.edits.setTitle, operations.edits.draft]);
  // @ts-expect-error a scope reference is required
  p.read("global");
  // @ts-expect-error raw address strings are not validated identities
  p.address("owner");
  // @ts-expect-error group identities cannot stand in for addresses
  p.address(authGroupId("group"));
  // @ts-expect-error booleans are not compiled condition tokens
  p.allow({ id: "bad", description: "bad", principal: p.anyone(), target: p.read(scopes.global), where: () => true });
  return p.initial({ version: 1, bindings, grants: [admin] });
} });
export const Model = materialize(Version);
export const Family = materialize(defineDocumentModelFamily({ versions: [Version], upgradeManifest: { documentType: "consumer/auth", latestVersion: 1, supportedVersions: [1], upgrades: {} } }));
export const bindings: InitialAuthBindings<typeof Version> = { deployment: { admin: authAddress("admin") }, instance: { owner: authAddress("owner"), company: authGroupId("company") } };
`;
const use = `
import { authAddress, authGroupId } from "document-model";
import type { InitialAuthBindings } from "document-model";
import { Model, Family, Version, bindings } from "./consumer.js";
Model.initialAuth.resolve(bindings);
Family.at(1).initialAuth.resolve(bindings);
const same: InitialAuthBindings<typeof Model> = bindings;
// @ts-expect-error missing required instance binding
Model.initialAuth.resolve({ deployment: { admin: authAddress("admin") }, instance: { owner: authAddress("owner") } });
// @ts-expect-error wrong binding kind
Model.initialAuth.resolve({ deployment: { admin: authGroupId("group") }, instance: bindings.instance });
// @ts-expect-error deployment keys cannot be moved to instance
Model.initialAuth.resolve({ deployment: {}, instance: { ...bindings.instance, admin: authAddress("admin") } });
// @ts-expect-error raw strings are not identity values
const raw: InitialAuthBindings<typeof Version> = { deployment: { admin: "admin" }, instance: bindings.instance };
export { same, raw };
`;
describe("initial auth public declarations", () => {
  it("retains operation, scope, original input, enum and binding types through declaration emit", () => {
    const result = compileConsumer({ "consumer.ts": consumer, "use.ts": use });
    expect(result.diagnostics).toEqual([]);
    expect(result.declaration).toContain("InitialAuthBindings");
    expect(result.declaration).not.toMatch(/\bany\b/u);
  });
});

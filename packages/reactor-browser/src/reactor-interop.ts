import type {
  DocumentChangeType,
  DuplicateManifestError,
  DuplicateModuleError,
} from "@powerhousedao/reactor";

/**
 * The handful of runtime values the browser-safe surface needs from
 * `@powerhousedao/reactor`, mirrored so that nothing on that surface has to
 * import the package as a value.
 *
 * `@powerhousedao/reactor` has a single entry point, and it reaches `pg`
 * (`dns`/`fs`/`net`/`tls`), `@electric-sql/pglite` and `node:worker_threads`. A
 * browser bundler must resolve all of those the moment any module imports a
 * VALUE from the package, which is what previously forced every consuming app
 * to alias the reactor away in its own build config. Type imports are erased
 * before the bundler ever sees them, so types keep coming from the reactor and
 * only these values are mirrored.
 *
 * Drift is a compile error rather than a runtime surprise - see the assertions
 * below.
 */

const DOCUMENT_CHANGE_TYPE_VALUES = {
  Created: "created",
  Deleted: "deleted",
  Updated: "updated",
  ParentAdded: "parent_added",
  ParentRemoved: "parent_removed",
  ChildAdded: "child_added",
  ChildRemoved: "child_removed",
} as const satisfies Record<string, `${DocumentChangeType}`>;

/**
 * `satisfies` above rejects a mirrored value the enum does not declare. This
 * rejects the other direction: a member the reactor added and this mirror does
 * not cover.
 */
type MissingDocumentChangeTypeMembers = Exclude<
  `${DocumentChangeType}`,
  (typeof DOCUMENT_CHANGE_TYPE_VALUES)[keyof typeof DOCUMENT_CHANGE_TYPE_VALUES]
>;
type AssertNoMissingDocumentChangeTypeMembers = [
  MissingDocumentChangeTypeMembers,
] extends [never]
  ? true
  : [
      "DOCUMENT_CHANGE_TYPE is missing DocumentChangeType members",
      MissingDocumentChangeTypeMembers,
    ];
const documentChangeTypeMirrorIsComplete: AssertNoMissingDocumentChangeTypeMembers = true;
void documentChangeTypeMirrorIsComplete;

/**
 * The reactor's `DocumentChangeType` members, typed as the enum so they can be
 * assigned to `DocumentChangeEvent.type`. The assertion is unavoidable - a
 * TypeScript string enum is nominal, so no string literal is assignable to it
 * without one - and the two checks above are what make it safe.
 */
export const DOCUMENT_CHANGE_TYPE = DOCUMENT_CHANGE_TYPE_VALUES as unknown as {
  readonly [K in keyof typeof DOCUMENT_CHANGE_TYPE_VALUES]: DocumentChangeType;
};

/**
 * Structural equivalents of the reactor error classes' own static `isError`
 * guards. Those guards match on `error.name` rather than the prototype chain
 * (`packages/reactor/src/registry/errors.ts`), so re-implementing them here is
 * behaviour-preserving and does not need the class at runtime.
 */
export function isDuplicateModuleError(
  error: unknown,
): error is DuplicateModuleError {
  return Error.isError(error) && error.name === "DuplicateModuleError";
}

export function isDuplicateManifestError(
  error: unknown,
): error is DuplicateManifestError {
  return Error.isError(error) && error.name === "DuplicateManifestError";
}

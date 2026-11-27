# Breaking changes guide

How this monorepo numbers its releases, what counts as a breaking change, and
how to deprecate and remove something. It is for everyone who changes a
published package.

## Version numbers

A version has three positions: `GENERATION.BREAKING.RELEASE`, for example
`6.4.0`.

| Position | Example        | What it means                                                                                             |
| -------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| First    | `6` in `6.4.0` | The framework generation. It changes rarely.                                                              |
| Second   | `4` in `6.4.0` | A release that may break. It ships with a migration note, and a `ph migrate` step where one is possible. |
| Third    | `1` in `6.4.1` | Features and fixes. Never breaking.                                                                       |

This is not Semantic Versioning. SemVer puts every breaking change in the first
position; here the second position carries them.

All published packages of the monorepo share one version and are released
together. Inside the monorepo they depend on each other with `workspace:*`,
which publishes as an exact version.

### What consumers must do

- Pin exact versions, or use a tilde range such as `~6.4.0`. A tilde range
  takes third-position releases only.
- Do not use a caret range. `^6.3.0` accepts `6.4.0`, and with it the break.
- Configure Renovate, Dependabot and similar tools to treat a second-position
  bump as a major update.

## The rule

1. **Deprecate in one release.** The deprecation ships in a third-position
   release. The old way keeps working and prints a warning that names the
   replacement and the release that removes the old way.
2. **Remove in the next breaking release, or later.** The removal ships no
   earlier than the next second-position release.

A third-position release never removes or changes something a consumer relies
on. If a fix cannot be made without a break, it waits for the next
second-position release.

Example: `ph switchboard` warns from `6.3.0` and names `ph run switchboard`.
Its classic boot path is removed in `6.4.0`.

## What counts as breaking

A change is breaking when a project, deployment or stored data that worked on
the previous release needs a change to keep working. That includes:

- **Code API**: removing or renaming an export, a function, a parameter or a
  type; changing a signature or a return type; making an optional parameter
  required.
- **CLI**: removing or renaming a command, a flag or an argument; changing a
  default; changing an exit code that scripts can depend on.
- **Configuration**: removing or renaming a key in `powerhouse.config.json` or
  in a host file; turning an ignored or accepted value into an error; removing
  or renaming an environment variable.
- **Network API**: removing or renaming a GraphQL field, argument or type;
  changing what a field returns; a change after which a client or peer on the
  previous release can no longer talk to this one.
- **Stored data**: a change to a database schema, a document format or a file
  layout that the previous release cannot read, or that this release cannot
  read without a migration.
- **Behaviour**: the same call with the same input does something a consumer
  can observe as different, and may depend on.
- **Requirements**: raising the minimum Node.js version, or a peer dependency
  range that excludes a version that worked before.

These are not breaking:

- Adding an export, a command, a flag, an optional parameter, an optional
  configuration key, or a GraphQL field or argument.
- Fixing behaviour that contradicted the documentation. Say so in the release
  notes when consumers may depend on the old behaviour.
- Changing anything that is not exported or documented.
- Adding a deprecation warning.

When you are not sure, treat the change as breaking.

## Deprecating

Do this in the third-position release that starts the deprecation.

1. Ship the replacement first, in the same release or an earlier one. A
   warning must be able to name something that works.
2. Keep the old way working, unchanged.
3. Warn at run time. The warning says what is deprecated, what replaces it,
   and which release removes it. Print it once per process or invocation, on
   stderr or through the logger, not on every call.
4. Mark the code with `@deprecated`, naming the replacement. For a GraphQL
   field or argument, use the `@deprecated` directive.
5. Link to a migration page when the consumer has more to do than rename one
   thing.
6. List the deprecation in the release notes under what warns.
7. Move the callers inside the monorepo to the replacement in the same change,
   so that our own code does not print the warning.
8. Add a test for the warning: its text, and that it prints once.

For the CLI, the deprecations of the current release live in
`packages/shared/clis/deprecations.ts`. A warning from that file ends with the
link in `MIGRATION_GUIDE_URL`, unless its deprecation sets another `link`, or
`null` for none. `DEPRECATIONS_REMOVED_IN` names the release that removes them.

## Removing

Do this in a second-position release.

1. Check that the deprecation shipped with its warning in an earlier release.
   If it did not, deprecate now and remove in the next breaking release.
2. Remove the old way, its warning and its tests.
3. Where the old input can still arrive (a command, a flag, a configuration
   key, an environment variable), fail with an error that names the
   replacement. Do not ignore it silently.
4. Add a `ph migrate` step when the change in a project can be made
   mechanically.
5. Write the migration note: what was removed, what to use instead, and the
   steps.
6. List the removal in the release notes.

## Retired flags

A feature flag that selected between an old and a new behaviour is retired
when the new behaviour becomes the only one. This takes two releases:

1. **Retire.** The flag has no effect any more. Set to the value that asked
   for the old behaviour, it prints a warning. Set to the value that is now
   fixed, it passes silently.
2. **Refuse.** In the next breaking release the process refuses to start when
   the flag is set to the value that asked for the old behaviour. The value
   that is now fixed still passes silently.

A removed flag must not be ignored silently: an operator who sets it to the
old value believes the old behaviour is on.

Retired environment variables are listed in
`packages/shared/clis/retired-flags.ts`, with the release that retired each
one and the release that refuses it.

Switches that turn a feature off are not feature flags in this sense, and they
stay. An explicit `false` always wins. Examples: `MCP_ENABLED`,
`PH_WORKFLOWS_ENABLED`, `DOCUMENT_MODEL_SUBGRAPHS_ENABLED`.

## Stored data and the migration floor

A change to stored data ships with a migration that runs when the new release
first opens the store. Such a one-time migration stays in the code for as long
as a store that needs it may still exist.

A store records the last release that completed its one-time migrations. Each
release has a migration floor: the oldest recorded release it can start from.
A release refuses to start on a store below its floor, and the error names the
release to run first. An empty store always passes.

When you delete a one-time migration:

1. Delete it in a second-position release only.
2. Raise `MIGRATION_FLOOR` in `packages/reactor/src/storage/migration-floor.ts`
   to the first release that no longer needs the deleted migration.
3. Say in the release notes which release a store must have run before this
   one.

Do not raise the floor for any other reason. A release that deletes no
migration keeps the floor it has.

## Upgrading across breaking releases

Consumers upgrade one breaking release at a time: to the latest third-position
release of the line they are on, clear its warnings, then to the next
second-position release. Write migration notes for that path. A note for
`6.4.0` may assume the project ran on `6.3` without warnings.

## Exempt packages

Experimental packages are outside this guide. They can change or break in any
release, without a deprecation period and without a migration note.

| Package                            | Status       |
| ---------------------------------- | ------------ |
| `@powerhousedao/reactor-hypercore` | Experimental |

A package is exempt only when it is in this table.

## Checklist for a breaking change

Before the deprecating release:

- [ ] The replacement is released.
- [ ] The old way still works and warns once, naming the replacement and the
      removing release.
- [ ] The code is marked `@deprecated`.
- [ ] Callers inside the monorepo use the replacement.
- [ ] The release notes list the deprecation.

Before the removing release:

- [ ] The warning shipped in an earlier release.
- [ ] Old input fails with an error that names the replacement.
- [ ] `ph migrate` has a step, where one is possible.
- [ ] The migration note is written and linked from the release notes.
- [ ] A deleted one-time migration raised the migration floor.
- [ ] The projects we maintain ourselves run on the release without warnings.

## Related documents

- [RELEASE.md](../RELEASE.md): how to cut a release.
- [RELEASE-NOTES.md](../RELEASE-NOTES.md): the notes of each release.

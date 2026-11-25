/**
 * `CodeFirstDocumentModelModule` is the deprecated name of
 * `MaterializedDocumentModelModule`. tsc checks the type assertions over the
 * test sources; the runtime assertions only keep the file a test.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  CodeFirstDocumentModelModule,
  MaterializedDocumentModelModule,
} from "../../../index.js";
import { TaskV1 } from "../fixtures/family-model.js";

type StateOf<T> =
  T extends MaterializedDocumentModelModule<infer TState, any> ? TState : never;
type ActionsOf<T> =
  T extends MaterializedDocumentModelModule<any, infer TActions>
    ? TActions
    : never;
type TaskState = StateOf<typeof TaskV1>;
type TaskActions = ActionsOf<typeof TaskV1>;

describe("CodeFirstDocumentModelModule", () => {
  it("is assignable to MaterializedDocumentModelModule and back", () => {
    const byOldName: CodeFirstDocumentModelModule<TaskState, TaskActions> =
      TaskV1;
    const byNewName: MaterializedDocumentModelModule<TaskState, TaskActions> =
      byOldName;
    const back: CodeFirstDocumentModelModule<TaskState, TaskActions> =
      byNewName;

    expectTypeOf<
      CodeFirstDocumentModelModule<TaskState, TaskActions>
    >().toEqualTypeOf<
      MaterializedDocumentModelModule<TaskState, TaskActions>
    >();
    expect(back).toBe(TaskV1);
  });

  it("takes the same type parameters, with the same defaults and constraints", () => {
    expectTypeOf<CodeFirstDocumentModelModule>().toEqualTypeOf<MaterializedDocumentModelModule>();
    expectTypeOf<CodeFirstDocumentModelModule<TaskState>>().toEqualTypeOf<
      MaterializedDocumentModelModule<TaskState>
    >();
    // @ts-expect-error A state that is not a PHBaseState is refused under both names.
    expectTypeOf<CodeFirstDocumentModelModule<string>>().toBeObject();
    // @ts-expect-error A state that is not a PHBaseState is refused under both names.
    expectTypeOf<MaterializedDocumentModelModule<string>>().toBeObject();
    expect(TaskV1.version).toBe(1);
  });
});

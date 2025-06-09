import { Provider, type WritableAtom } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import { type ReactNode } from "react";
import { atomStore } from "./store.js";

type AtomValues = Iterable<
  readonly [WritableAtom<unknown, [any], unknown>, unknown]
>;

export function AtomStoreProvider({
  atomValues,
  children,
}: {
  atomValues: AtomValues;
  children: ReactNode;
}) {
  return (
    <Provider store={atomStore}>
      <AtomsHydrator atomValues={atomValues}>{children}</AtomsHydrator>
    </Provider>
  );
}

function AtomsHydrator({
  atomValues,
  children,
}: {
  atomValues: AtomValues;
  children: ReactNode;
}) {
  useHydrateAtoms(new Map(atomValues));
  return children;
}

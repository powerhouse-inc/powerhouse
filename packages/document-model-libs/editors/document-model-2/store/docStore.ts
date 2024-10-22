import { Store } from "@tanstack/store";
import {
  INITIAL_STATE_DOC_ID,
  initialStateDoc,
  STANDARD_LIB_DOC_ID,
  STATE_DOC_ID,
} from "../constants/documents";
import { typeDefs } from "@powerhousedao/scalars";
import { renameMapKey } from "../lib";

export const docStore = new Store<Map<string, string>>(
  new Map([
    [STATE_DOC_ID, initialStateDoc.toString()],
    [INITIAL_STATE_DOC_ID, ""],
    [STANDARD_LIB_DOC_ID, typeDefs.join("\n")],
  ]),
);

export function addDoc(name: string, doc: string) {
  docStore.setState((state) => {
    const newState = new Map(state);
    newState.set(name, doc);
    return newState;
  });
}

export function updateDoc(name: string, doc: string) {
  docStore.setState((state) => {
    const newState = new Map(state);
    newState.set(name, doc);
    return newState;
  });
}

export function removeDoc(name: string) {
  docStore.setState((state) => {
    const newState = new Map(state);
    newState.delete(name);
    return newState;
  });
}

export function renameDoc(oldDocName: string, newDocName: string) {
  docStore.setState((state) => {
    const newState = renameMapKey(state, oldDocName, newDocName);
    return newState;
  });
}

export function getFullDoc() {
  return Array.from(docStore.state.values()).join("\n");
}

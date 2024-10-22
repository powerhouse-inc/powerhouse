import {
  LOCAL_STATE_DOC_ID,
  initialLocalStateDoc,
} from "../constants/documents";
import { addDoc, removeDoc } from "../store/docStore";

export function addLocalStateEditor() {
  addDoc(LOCAL_STATE_DOC_ID, initialLocalStateDoc);
}

export function removeLocalStateEditor() {
  removeDoc(LOCAL_STATE_DOC_ID);
}

export function removeEditor(idToRemove: string) {
  removeDoc(idToRemove);
}

import { useAtomValue, useSetAtom } from "jotai";
import { themeAtom } from "./atoms.js";

export const useTheme = () => useAtomValue(themeAtom);
export const useSetTheme = () => useSetAtom(themeAtom);

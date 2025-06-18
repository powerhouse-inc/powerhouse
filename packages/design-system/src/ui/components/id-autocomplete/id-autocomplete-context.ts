import { createContext, useContext } from "react";

export const IdAutocompleteContext = createContext<Record<string, unknown>>({});

export const useIdAutocompleteContext = () => useContext(IdAutocompleteContext);

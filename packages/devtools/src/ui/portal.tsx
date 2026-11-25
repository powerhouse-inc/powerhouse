import { createContext, useContext, type ReactNode } from "react";

const DevtoolsPortalContext = createContext<HTMLElement | null>(null);

export function DevtoolsPortalProvider({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <DevtoolsPortalContext.Provider value={container}>
      {children}
    </DevtoolsPortalContext.Provider>
  );
}

export function useDevtoolsPortal(): HTMLElement | null {
  return useContext(DevtoolsPortalContext);
}

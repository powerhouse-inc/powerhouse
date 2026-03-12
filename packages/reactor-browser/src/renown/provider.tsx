import { RenownBuilder } from "@renown/sdk";
import { type ReactNode, useEffect, useRef } from "react";
import { addRenownEventHandler, setRenown } from "../hooks/renown.js";
import { login } from "./utils.js";

export interface RenownProviderProps {
  appName: string;
  basename?: string;
  baseUrl?: string;
  children: ReactNode;
}

async function initRenown(
  appName: string,
  basename: string | undefined,
  baseUrl: string | undefined,
) {
  addRenownEventHandler();

  const builder = new RenownBuilder(appName, { basename, baseUrl });
  const renown = await builder.build();
  setRenown(renown);

  await login(undefined, renown);
}

export function RenownProvider({
  appName,
  basename,
  baseUrl,
  children,
}: RenownProviderProps) {
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    if (typeof window === "undefined" || window.ph?.renown !== undefined) {
      return;
    }

    initRenown(appName, basename, baseUrl).catch(console.error);
  }, []);

  const initialPropsRef = useRef({ appName, basename, baseUrl });

  if (initialPropsRef.current.appName !== appName) {
    console.warn(
      "RenownProvider: 'appName' changed after mount. This prop is only read once during initialization.",
    );
  }
  if (initialPropsRef.current.basename !== basename) {
    console.warn(
      "RenownProvider: 'basename' changed after mount. This prop is only read once during initialization.",
    );
  }
  if (initialPropsRef.current.baseUrl !== baseUrl) {
    console.warn(
      "RenownProvider: 'baseUrl' changed after mount. This prop is only read once during initialization.",
    );
  }

  return children;
}

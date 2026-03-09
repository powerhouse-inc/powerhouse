"use client";

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

export function RenownProvider({
  appName,
  basename,
  baseUrl,
  children,
}: RenownProviderProps) {
  const initRef = useRef(false);
  const initialPropsRef = useRef({ appName, basename, baseUrl });

  if (initRef.current) {
    const initial = initialPropsRef.current;
    if (appName !== initial.appName) {
      console.warn(
        "RenownProvider: 'appName' changed after mount. This prop is only read once during initialization.",
      );
    }
    if (basename !== initial.basename) {
      console.warn(
        "RenownProvider: 'basename' changed after mount. This prop is only read once during initialization.",
      );
    }
    if (baseUrl !== initial.baseUrl) {
      console.warn(
        "RenownProvider: 'baseUrl' changed after mount. This prop is only read once during initialization.",
      );
    }
  }

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    if (!window.ph) {
      window.ph = {};
    }
    addRenownEventHandler();

    const init = async () => {
      const builder = new RenownBuilder(appName, { basename, baseUrl });
      const instance = await builder.build();

      setRenown(instance);

      await login(undefined, instance);
    };

    init().catch(console.error);
  }, []);

  return children;
}

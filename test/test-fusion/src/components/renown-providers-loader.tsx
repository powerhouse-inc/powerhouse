"use client";

import type { User } from "@renown/sdk";
import type { ReactNode } from "react";
import { RenownProviders } from "./renown-providers";

// Renown's provider tree is SSR-safe (init runs in effects, stores expose
// server snapshots, wallet libs load lazily), so it needs no `ssr: false`.
export function RenownProvidersLoader({
  children,
  session,
}: {
  children: ReactNode;
  session?: { user?: User } | null;
}) {
  return <RenownProviders session={session}>{children}</RenownProviders>;
}

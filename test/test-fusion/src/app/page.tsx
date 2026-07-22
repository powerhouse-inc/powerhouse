"use client";

import { useRenownAuth } from "@powerhousedao/reactor-browser/renown";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthState } from "@/components/use-auth-state";

export default function Home() {
  const router = useRouter();
  const authState = useAuthState();
  const { user, displayName, displayAddress, logout } = useRenownAuth();

  // Gate the app: unauthenticated visitors go to the login screen.
  useEffect(() => {
    if (authState === "unauthenticated") router.replace("/login");
  }, [authState, router]);

  if (authState !== "authenticated") {
    return (
      <main className="flex flex-1 items-center justify-center p-16">
        <p className="text-sm text-foreground/50">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-16 text-center">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Test Fusion</h1>
        <p className="text-sm text-foreground/60">
          You are signed in with Renown.
        </p>
      </div>
      <div className="flex w-72 flex-col items-center gap-3 rounded-2xl border border-black/10 p-6 dark:border-white/15">
        <p className="text-sm text-foreground/60">Signed in as</p>
        <p className="text-lg font-semibold">
          {displayName ?? displayAddress ?? "Renown user"}
        </p>
        {user?.address ? (
          <p className="w-full break-all font-mono text-xs text-foreground/50">
            {user.address}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-2 h-9 w-full rounded-lg border border-black/15 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Log out
        </button>
      </div>
    </main>
  );
}

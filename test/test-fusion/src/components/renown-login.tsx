"use client";

import {
  useRenownAuth,
  useRenownLoginMethods,
} from "@powerhousedao/reactor-browser/renown";
import { LoginMethod } from "@renown/sdk/wallet";
import { WALLET_ADAPTERS } from "@/lib/renown";

export function RenownLogin() {
  const {
    status,
    user,
    displayName,
    displayAddress,
    login,
    pending,
    error,
    logout,
  } = useRenownAuth();
  const methods = useRenownLoginMethods(WALLET_ADAPTERS);

  if (user) {
    return (
      <div className="flex w-72 flex-col items-center gap-3 rounded-2xl border border-black/10 p-6 dark:border-white/15">
        <p className="text-sm text-foreground/60">Signed in as</p>
        <p className="text-lg font-semibold">
          {displayName ?? displayAddress ?? "Renown user"}
        </p>
        {user.address ? (
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
    );
  }

  const wallet = methods.find((m) => m.id === LoginMethod.WALLET);
  const others = methods.filter((m) => m.id !== LoginMethod.WALLET);
  const busy = pending || status === "loading";

  return (
    <div className="flex w-72 flex-col gap-3 rounded-2xl border border-black/10 p-6 dark:border-white/15">
      <h2 className="text-center text-lg font-semibold">Sign in with Renown</h2>
      {wallet ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => login(undefined, wallet.id)}
          className="h-10 w-full rounded-lg bg-foreground text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {wallet.label}
        </button>
      ) : null}
      {wallet && others.length > 0 ? (
        <div className="my-1 flex items-center gap-3 text-xs uppercase tracking-wider text-foreground/40">
          <div className="h-px flex-1 bg-current opacity-30" />
          or
          <div className="h-px flex-1 bg-current opacity-30" />
        </div>
      ) : null}
      {others.map((m) => (
        <button
          key={m.id}
          type="button"
          disabled={busy}
          onClick={() => login(undefined, m.id)}
          className="h-10 w-full rounded-lg border border-black/15 text-sm font-semibold transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          {m.label}
        </button>
      ))}
      {busy ? (
        <p className="text-center text-xs text-foreground/50">Connecting…</p>
      ) : null}
      {error ? (
        <p className="text-center text-xs text-red-500">{error.message}</p>
      ) : null}
    </div>
  );
}

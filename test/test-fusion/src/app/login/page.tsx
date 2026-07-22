"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { RenownLogin } from "@/components/renown-login";
import { useAuthState } from "@/components/use-auth-state";

export default function LoginPage() {
  const router = useRouter();
  const authState = useAuthState();

  // Already signed in? Send them to the app.
  useEffect(() => {
    if (authState === "authenticated") router.replace("/");
  }, [authState, router]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-16 text-center">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Test Fusion</h1>
        <p className="text-sm text-foreground/60">
          Renown in-page sign-in with Rainbow &amp; Privy.
        </p>
      </div>
      <RenownLogin />
    </main>
  );
}

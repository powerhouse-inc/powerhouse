import type { Metadata } from "next";
import { RenownProvidersLoader } from "@/components/renown-providers-loader";
import { verifySession } from "@/lib/dal";
import "./globals.css";

export const metadata: Metadata = {
  title: "Test Fusion",
  description: "Powerhouse monorepo Next.js test app",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Server-side session → seed the client provider so the first render (server
  // + hydration) is already authenticated when a valid cookie is present.
  const session = await verifySession();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <RenownProvidersLoader session={session}>
          {children}
        </RenownProvidersLoader>
      </body>
    </html>
  );
}

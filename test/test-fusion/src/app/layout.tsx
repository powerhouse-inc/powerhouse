import type { Metadata } from "next";
import { RenownProvidersLoader } from "@/components/renown-providers-loader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Test Fusion",
  description: "Powerhouse monorepo Next.js test app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <RenownProvidersLoader>{children}</RenownProvidersLoader>
      </body>
    </html>
  );
}

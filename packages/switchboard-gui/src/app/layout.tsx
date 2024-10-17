import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PublicEnvScript } from "next-runtime-env";
import Header from "@/components/header/header";
import Link from "next/link";
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Switchboard API",
  description: "Switchboard API is a decentralized API gateway for Web3.0.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <PublicEnvScript />
        <Link rel="apple-touch-icon" href={`/apple-touch-icon.png`} />

        <Link rel="icon" type="image/png" href={`/favicon-16x16.png`} />
        <Link rel="manifest" href={`/site.webmanifest`} />
      </head>
      <body className={inter.className}>
        <div className="bg-gray-100">
          <Header />
          <main className={`mx-auto mt-14 min-h-[calc(100vh-64px)] `}>
            <div className="">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}

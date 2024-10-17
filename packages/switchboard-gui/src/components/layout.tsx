import { useRouter } from "next/router";
import Header from "@/components/header/header";
import Head from "next/head";

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const router = useRouter();
    let container = "";

    if (router.pathname !== "/" && !router.pathname.includes("/graphql")) {
        container = "container";
    }

    return (
        <>
            <Head>
                <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
                <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
                <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
                <link rel="manifest" href="/site.webmanifest" />
                <title>Switchboard API</title>
            </Head>
            <div className="bg-gray-100">
                <Header />
                <main className={`mx-auto mt-14 min-h-[calc(100vh-64px)]  ${container}`}>
                    <div className="">{children}</div>
                </main>
            </div>
        </>
    );
}

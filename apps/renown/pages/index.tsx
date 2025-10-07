import type { NextPage } from "next";
import Image from "next/image";
import Head from "next/head";
import styles from "../styles/Home.module.css";
import { useRouter } from "next/router";
import Connect from "../components/connect-flow";
import { useEffect, useState } from "react";
import RenownLight from "../assets/images/Renown-light.svg";
import PhIcons from "../assets/images/ph-icons.svg";
import LandingGradient from "../assets/images/landing-gradient.jpg";
import Noise from "../assets/images/noise.png";

const Home: NextPage = () => {
    const router = useRouter();
    const connectId = router.query["connect"]?.toString();
    const deeplink = router.query["deeplink"]?.toString();
    const returnUrl = router.query["returnUrl"]?.toString();
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(typeof indexedDB !== "undefined");
    }, []);

    return (
        <div className="relative overflow-hidden">
            <div className="absolute w-screen top-0 bottom-0 overflow-hidden z-0 fill-[#404040]">
                <Image
                    priority
                    src={LandingGradient}
                    alt="background"
                    className="absolute w-[101vw] max-w-none h-full z-0 object-cover"
                />
                <Image
                    priority
                    src={Noise}
                    alt="noise"
                    className="absolute w-[101vw] max-w-none h-full z-0 object-cover"
                />
                <Image
                    priority
                    src={PhIcons}
                    alt="Renown"
                    className="absolute left-0 bottom-0 pointer-events-none"
                />
                <Image
                    priority
                    src={RenownLight}
                    alt="Renown"
                    width={154}
                    height={48}
                    className="absolute left-8 top-3"
                />
            </div>
            <div className={styles.container}>
                <Head>
                    <title>Renown</title>
                    <meta content="Created by Powerhouse" name="description" />
                    <link href="/favicon.ico" rel="icon" />
                </Head>

                <main className={styles.main}>
                    {connectId && isClient && (
                        <Connect
                            connectId={connectId}
                            deeplink={deeplink}
                            returnUrl={returnUrl}
                        />
                    )}
                </main>
            </div>
        </div>
    );
};

export default Home;

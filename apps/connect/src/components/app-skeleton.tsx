import {
    AnimatedLoader,
    ConnectSidebar,
    HomeScreen,
} from '@powerhousedao/design-system';
import { useEffect, useState } from 'react';

const isHome = window.location.pathname === '/';

const LOADER_DELAY = 250;

const Loader = () => {
    const [showLoading, setShowLoading] = useState(false);

    useEffect(() => {
        const id = setTimeout(() => {
            setShowLoading(true);
        }, LOADER_DELAY);

        return () => clearTimeout(id);
    }, []);
    return showLoading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="rounded-full overflow-hidden shadow-lg animate-pulse">
                <AnimatedLoader />
            </div>
        </div>
    ) : null;
};

export const AppSkeleton = () => {
    return (
        <div className="flex h-screen">
            <ConnectSidebar
                className="animate-pulse"
                onLogin={undefined}
                onDisconnect={undefined}
                onClickSettings={undefined}
                address={undefined}
            />
            {isHome ? <HomeScreen children={<Loader />} /> : <Loader />}
        </div>
    );
};

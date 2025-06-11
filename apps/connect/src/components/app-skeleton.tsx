import {
    ConnectSidebar,
    HomeScreen,
    LoadingScreen,
} from '@powerhousedao/design-system';
import { useEffect, useState } from 'react';

const isHome = window.location.pathname === '/';

export const AppSkeleton = () => {
    const [showLoading, setShowLoading] = useState(false);

    useEffect(() => {
        const id = setTimeout(() => {
            setShowLoading(true);
        }, 250);

        return () => clearTimeout(id);
    }, []);

    return (
        <div className="flex h-screen">
            <ConnectSidebar
                className="animate-pulse"
                onLogin={undefined}
                onDisconnect={undefined}
                onClickSettings={undefined}
                address={undefined}
            />
            {isHome ? (
                <HomeScreen children={undefined} />
            ) : (
                <LoadingScreen
                    showLoadingScreen={showLoading}
                    className="bg-transparent"
                />
            )}
        </div>
    );
};

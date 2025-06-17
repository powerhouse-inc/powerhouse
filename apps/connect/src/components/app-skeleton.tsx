import {
    AnimatedLoader,
    ConnectSidebar,
    HomeScreen,
} from '@powerhousedao/design-system';
import { useEffect, useState } from 'react';

const LOADER_DELAY = 250;

const Loader = ({ delay = LOADER_DELAY }: { delay?: number }) => {
    const isSSR = typeof window === 'undefined';
    const showInitialLoader =
        typeof document !== 'undefined' &&
        document.body.getAttribute('data-show-loader') === 'true';

    const [showLoading, setShowLoading] = useState(!delay || showInitialLoader);

    useEffect(() => {
        const id = setTimeout(() => {
            setShowLoading(true);
        }, delay);

        return () => clearTimeout(id);
    }, []);

    return (
        <div
            className={`skeleton-loader absolute inset-0 z-10 flex items-center justify-center ${showLoading ? '' : 'hidden'}`}
        >
            <div className="rounded-full overflow-hidden shadow-lg animate-pulse">
                <AnimatedLoader />
            </div>
            {isSSR ? (
                <script
                    dangerouslySetInnerHTML={{
                        __html: `setTimeout(() => {
                        document.querySelector('.skeleton-loader')?.classList.remove('hidden');
                        document.body.setAttribute('data-show-loader', 'true');
                    }, ${delay})`,
                    }}
                />
            ) : null}
        </div>
    );
};

export const AppSkeleton = () => {
    const isSSR = typeof window === 'undefined';
    return (
        <div className="flex h-screen">
            <ConnectSidebar
                className="animate-pulse"
                onLogin={undefined}
                onDisconnect={undefined}
                onClickSettings={undefined}
                address={undefined}
            />
            <HomeScreen
                containerClassName={isSSR ? 'hidden home-screen' : undefined}
                children={null}
            />
            {isSSR ? (
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
                    if (window.location.pathname === '/') {
                        document.querySelector('.home-screen')?.classList.remove('hidden')
                    }`,
                    }}
                />
            ) : null}
            <Loader />
        </div>
    );
};

export default AppSkeleton;

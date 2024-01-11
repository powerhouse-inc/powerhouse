import { ReactComponent as IconConnect } from '@/assets/icons/connect.svg';
import { ReactComponent as IconLogo } from '@/assets/icons/logo.svg';
import { ItemsContextProvider } from '@powerhousedao/design-system';
import { useSetAtom } from 'jotai';
import React, { Suspense, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useDropFile } from 'src/hooks';
import { isElectron, isMac } from 'src/hooks/utils';
import { userAtom } from 'src/store';
import Sidebar from './sidebar';

const ROOT_FILE_DROP = false;

const Root = () => {
    const ref = React.useRef(null);

    const setUser = useSetAtom(userAtom);

    useEffect(() => {
        window.electronAPI?.ready();

        window.electronAPI?.user().then(user => {
            setUser(user);
        });

        const unsubscribeLogin = window.electronAPI?.handleLogin((_, user) => {
            setUser(user);
        });
        return unsubscribeLogin;
    }, []);

    let { dropProps, isDropTarget } = useDropFile(ref);

    if (!ROOT_FILE_DROP) {
        dropProps = {};
        isDropTarget = false;
    }

    return (
        <ItemsContextProvider>
            <div className="h-screen">
                {isElectron && (
                    <div
                        className={`h-8 w-full
                    ${isMac && 'justify-center'}
                    flex items-center bg-gray-50
                    [-webkit-app-region:drag]`}
                    >
                        <IconLogo className="ml-1 mr-0.5 p-1.5" />
                        <IconConnect className="h-3 w-fit" />
                    </div>
                )}
                <div
                    className={`flex items-stretch overflow-auto
                        ${isElectron ? 'h-app-height' : 'h-screen'}
                        ${isDropTarget ? 'bg-slate-50' : 'bg-white'}
                    `}
                    {...dropProps}
                    role="presentation"
                    tabIndex={0}
                >
                    <Suspense>
                        <Sidebar />
                        <div className="relative flex-1 overflow-auto">
                            <Outlet />
                        </div>
                        <div
                            ref={ref}
                            className={`pointer-events-none fixed inset-0 bg-current
                            transition-opacity duration-150 ease-in-out
                            ${isDropTarget ? 'opacity-10' : 'opacity-0'}
                        `}
                        ></div>
                    </Suspense>
                </div>
            </div>
        </ItemsContextProvider>
    );
};

export const element = <Root />;
export const errorElement = <Root />;

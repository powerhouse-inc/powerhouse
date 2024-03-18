import { ReactComponent as IconConnect } from '@/assets/icons/connect.svg';
import { ReactComponent as IconLogo } from '@/assets/icons/logo.svg';
import { useAtom } from 'jotai';
import React, { Suspense, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useDropFile } from 'src/hooks';
import { useLoadInitialData } from 'src/hooks/useLoadInitialData';
import { isElectron, isMac } from 'src/hooks/utils';
import { userAtom } from 'src/store/user';
import Sidebar from './sidebar';

const ROOT_FILE_DROP = false;

const Root = () => {
    useLoadInitialData();
    const ref = React.useRef(null);

    const [user, setUser] = useAtom(userAtom);

    useEffect(() => {
        window.electronAPI?.ready();

        window.electronAPI
            ?.user()
            .then(user => {
                setUser(user);
            })
            .catch(console.error);

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
                        className={`bg-current pointer-events-none fixed inset-0
                            transition-opacity duration-150 ease-in-out
                            ${isDropTarget ? 'opacity-10' : 'opacity-0'}
                        `}
                    ></div>
                </Suspense>
            </div>
        </div>
    );
};

export const element = <Root />;
export const errorElement = <Root />;

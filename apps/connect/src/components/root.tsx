import IconConnect from '#assets/icons/connect.svg?react';
import IconLogo from '#assets/icons/logo.svg?react';
import { ModalManager } from '#components';
import { isElectron, isMac } from '#hooks';
import { login } from '@powerhousedao/reactor-browser';
import { logger } from 'document-drive';
import { Suspense, useEffect } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';
import Sidebar from './sidebar.js';

export default function Root() {
    useEffect(() => {
        window.electronAPI?.ready();
    }, []);

    const [searchParams, setSearchParams] = useSearchParams();

    useEffect(() => {
        const userStr = searchParams.get('user');
        if (userStr && login) {
            const userDid = decodeURIComponent(userStr);
            searchParams.delete('user');
            setSearchParams(searchParams);
            login(userDid).catch(logger.error);
        }
    }, [login, searchParams, setSearchParams]);

    useEffect(() => {
        const unsubscribe = window.electronAPI?.handleURL((_e, url) => {
            window.history.pushState({}, '', `/${url}`);
        });

        return unsubscribe;
    }, []);

    return (
        <ModalManager>
            <div className="h-screen">
                {isElectron && (
                    <div
                        className={`h-8 w-full
                    ${isMac && 'justify-center'}
                    flex items-center bg-gray-50`}
                    >
                        <IconLogo className="ml-1 mr-0.5 p-1.5" />
                        <IconConnect className="h-3 w-fit" />
                    </div>
                )}
                <div
                    className={`flex items-stretch overflow-auto
                        ${isElectron ? 'h-app-height' : 'h-screen'}
                    `}
                    role="presentation"
                    tabIndex={0}
                >
                    <Suspense name="Root">
                        <Sidebar />
                        <div className="relative flex-1 overflow-auto">
                            <Outlet />
                        </div>
                    </Suspense>
                </div>
            </div>
        </ModalManager>
    );
}

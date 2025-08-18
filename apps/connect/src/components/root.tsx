import { ModalManager } from '#components';
// import { isElectron, isMac } from '#hooks';
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './sidebar.js';

export default function Root() {
    // useEffect(() => {
    //     window.electronAPI?.ready();
    // }, []);

    // useEffect(() => {
    //     const unsubscribe = window.electronAPI?.handleURL((_e, url) => {
    //         window.history.pushState({}, '', `/${url}`);
    //     });

    //     return unsubscribe;
    // }, []);

    return (
        <ModalManager>
            <div className="h-screen">
                {/* {isElectron && (
                    <div
                        className={`h-8 w-full
                    ${isMac && 'justify-center'}
                    flex items-center bg-gray-50`}
                    >
                        <IconLogo className="ml-1 mr-0.5 p-1.5" />
                        <IconConnect className="h-3 w-fit" />
                    </div>
                )} */}
                <div
                    className={`flex items-stretch overflow-auto h-screen`}
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

import { ModalManager } from '#components';
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './sidebar.js';

export default function Root() {
    return (
        <ModalManager>
            <div className="h-screen">
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

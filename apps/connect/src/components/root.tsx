import { useLoadInitialData } from '#hooks/useLoadInitialData';
import { useLogin } from '#hooks/useLogin';
import { useNodeNavigation } from '#hooks/useNodeNavigation';
import { isElectron, isMac } from '#hooks/utils';
import { logger } from '#services/logger';
import IconConnect from '@/assets/icons/connect.svg?react';
import IconLogo from '@/assets/icons/logo.svg?react';
import { logger } from 'document-drive/logger';
import { Suspense, useEffect } from 'react';
import { Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { useLoadInitialData } from 'src/hooks/useLoadInitialData';
import { useLogin } from 'src/hooks/useLogin';
import { useNodeNavigation } from 'src/hooks/useNodeNavigation';
import { isElectron, isMac } from 'src/hooks/utils';
import Sidebar from './sidebar';

export default function Root() {
    useLoadInitialData();
    useNodeNavigation();

    const navigate = useNavigate();
    const { login } = useLogin();

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
            navigate(`/${url}`);
        });

        return unsubscribe;
    }, [navigate]);

    return (
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
                <Suspense>
                    <Sidebar />
                    <div className="relative flex-1 overflow-auto">
                        <Outlet />
                    </div>
                </Suspense>
            </div>
        </div>
    );
}

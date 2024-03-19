import { ReactComponent as IconRenown } from '@/assets/icons/renown.svg';
import { Button } from '@powerhousedao/design-system';
import { useState } from 'react';
import DotsLoader from 'src/components/dots-loader';
import { useConnectCrypto } from 'src/hooks/useConnectCrypto';
import { useRenown } from 'src/hooks/useRenown';
import { RENOWN_URL } from 'src/services/renown/constants';
import { useUser } from 'src/store/user';

type LoginStatus = 'initial' | 'checking' | 'not-authorized' | 'authorized';

export const Login: React.FC = () => {
    const [status, setStatus] = useState<LoginStatus>('initial');
    const user = useUser();
    const renown = useRenown();
    const { did } = useConnectCrypto();

    async function login() {
        const connectId = await did();
        const url = `${RENOWN_URL}?connect=${encodeURIComponent(connectId)}`;

        if (window.electronAPI) {
            const protocol = await window.electronAPI.protocol();
            await window.electronAPI.openURL(`${url}&deeplink=${protocol}`);
        } else {
            window.open(url, '_blank')?.focus();
        }
    }

    async function checkLogin() {
        try {
            setStatus('checking');
            const connectId = await did();
            const user = await renown?.login(connectId);
            if (user) {
                setStatus('authorized');
            } else {
                setStatus('initial');
            }
        } catch (e) {
            setStatus('not-authorized');
        }
    }

    if (status === 'initial' && user) {
        setStatus('authorized');
    }

    return (
        <div>
            {status === 'checking' ? (
                <h2 className="px-4 py-5 text-center text-xl font-medium">
                    <span>Checking Authorization</span>
                    <span className="inline-block w-5 text-left">
                        <DotsLoader />
                    </span>
                </h2>
            ) : status !== 'authorized' ? (
                <div className="flex flex-col items-center">
                    <h2 className="mb-1 text-2xl font-semibold">Log in with</h2>
                    <IconRenown className="mb-3" />
                    <p className="mb-5 text-center text-lg leading-6">
                        Click on the button below to start signing messages in
                        Connect on behalf of your Ethereum identity
                    </p>
                    <Button
                        onClick={() => login()}
                        disabled={!renown}
                        className="mb-3 w-full p-0 text-white shadow-none transition-colors"
                    >
                        <p className="block h-10 px-7 leading-10">
                            Authorize Connect
                        </p>
                    </Button>
                </div>
            ) : (
                <p className="p-4 pb-5">
                    Logged in with address: {user?.address}
                </p>
            )}
        </div>
    );
};

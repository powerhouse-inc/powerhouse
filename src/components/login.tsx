import IconRenown from '@/assets/icons/renown.svg?react';
import { Button } from '@powerhousedao/design-system';
import DotsLoader from 'src/components/dots-loader';
import { useLogin } from 'src/hooks/useLogin';
import { useUser } from 'src/store/user';

export const Login: React.FC = () => {
    const user = useUser();

    const { openRenown, status } = useLogin();

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
                        onClick={() => openRenown()}
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

import { useLogin } from './useLogin';

type AllowListType = 'arbitrum' | 'rwa' | 'none';
export function useAllowList(): {
    isAllowed: boolean;
    allowListType: AllowListType;
} {
    const { user, status } = useLogin();

    const arbitrumAllowListEnvString = import.meta.env.VITE_ARBITRUM_ALLOW_LIST;
    const rwaAllowListEnvString = import.meta.env.VITE_RWA_ALLOW_LIST;

    const arbitrumAllowListIsDefined =
        !!arbitrumAllowListEnvString && arbitrumAllowListEnvString !== '';
    const rwaAllowListIsDefined =
        !!rwaAllowListEnvString && rwaAllowListEnvString !== '';

    if (arbitrumAllowListIsDefined && rwaAllowListIsDefined) {
        throw new Error(
            'Both Arbitrum and RWA allow lists are defined. Please only define one.',
        );
    }

    if (arbitrumAllowListIsDefined) {
        const arbitrumAllowList = arbitrumAllowListEnvString.split(',');

        if (status !== 'authorized' || !user)
            return {
                isAllowed: false,
                allowListType: 'arbitrum',
            };

        const userAddressIsOnAllowList = arbitrumAllowList.includes(
            user.address,
        );

        if (userAddressIsOnAllowList)
            return {
                isAllowed: true,
                allowListType: 'arbitrum',
            };

        return {
            isAllowed: false,
            allowListType: 'arbitrum',
        };
    }

    if (rwaAllowListIsDefined) {
        const rwaAllowList = rwaAllowListEnvString.split(',');

        if (status !== 'authorized' || !user)
            return {
                isAllowed: false,
                allowListType: 'rwa',
            };

        const userAddressIsOnAllowList = rwaAllowList.includes(user.address);

        if (userAddressIsOnAllowList)
            return {
                isAllowed: true,
                allowListType: 'rwa',
            };

        return {
            isAllowed: false,
            allowListType: 'rwa',
        };
    }

    return {
        isAllowed: true,
        allowListType: 'none',
    };
}

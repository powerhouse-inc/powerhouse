import {
    ACCOUNTS,
    FIXED_INCOME_TYPES,
    OtherTab,
    OtherTableComponents,
    SERVICE_PROVIDER_FEE_TYPES,
    SPVS,
} from '@powerhousedao/design-system';
import { IProps } from '../editor';
import { Accounts } from './accounts';
import { FixedIncomeTypes } from './fixed-income-types';
import { ServiceProviderFeeTypes } from './service-provider-fee-types';
import { SPVs } from './spvs';

export function Other(props: IProps) {
    const otherTableComponents: OtherTableComponents = [
        {
            value: ACCOUNTS,
            label: 'Accounts',
            description:
                'Add and manage accounts that can be associated with transactions and fees.',
            // eslint-disable-next-line react/no-unstable-nested-components
            Component: () => <Accounts {...props} />,
        },
        {
            value: FIXED_INCOME_TYPES,
            label: 'Fixed Income Types',
            description: 'Add and manage fixed income asset types.',
            // eslint-disable-next-line react/no-unstable-nested-components
            Component: () => <FixedIncomeTypes {...props} />,
        },
        {
            value: SPVS,
            label: 'Special Purpose Vehicles (SPVs)',
            description: 'Add and manage special purpose vehicles (SPVs).',
            // eslint-disable-next-line react/no-unstable-nested-components
            Component: () => <SPVs {...props} />,
        },
        {
            value: SERVICE_PROVIDER_FEE_TYPES,
            label: 'Service Provider Fee Types',
            description:
                'Add and manage service providers and their associated fee types.',
            // eslint-disable-next-line react/no-unstable-nested-components
            Component: () => <ServiceProviderFeeTypes {...props} />,
        },
    ];
    return <OtherTab otherTableComponents={otherTableComponents} />;
}

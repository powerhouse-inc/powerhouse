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
            Component: () => <Accounts {...props} />,
        },
        {
            value: FIXED_INCOME_TYPES,
            label: 'Fixed Income Types',
            description: 'Add and manage fixed income asset types.',
            Component: () => <FixedIncomeTypes {...props} />,
        },
        {
            value: SPVS,
            label: 'Special Purpose Vehicles (SPVs)',
            description: 'Add and manage special purpose vehicles (SPVs).',
            Component: () => <SPVs {...props} />,
        },
        {
            value: SERVICE_PROVIDER_FEE_TYPES,
            label: 'Service Provider Fee Types',
            description:
                'Add and manage service providers and their associated fee types.',
            Component: () => <ServiceProviderFeeTypes {...props} />,
        },
    ];
    return <OtherTab otherTableComponents={otherTableComponents} />;
}

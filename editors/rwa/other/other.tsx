import { IProps } from '../editor';
import { Accounts } from './accounts';
import { FixedIncomeTypes } from './fixed-income-types';
import { ServiceProviderFeeTypes } from './service-provider-fee-types';
import { SPVs } from './spvs';

export const Other = (props: IProps) => {
    return (
        <div>
            <h2 className="text-lg font-bold mb-2">Accounts</h2>
            <p className="text-xs text-gray-600 mb-4">
                Add and manage accounts that can be associated with transactions
                and fees.
            </p>
            <Accounts {...props} />
            <h2 className="text-lg font-bold mt-4 mb-2">
                Fixed Income Asset Types
            </h2>
            <p className="text-xs text-gray-600 mb-4">
                Add and manage fixed income asset types.
            </p>
            <FixedIncomeTypes {...props} />
            <h2 className="text-lg font-bold mt-4 mb-2">
                Special Purpose Vehicles (SPVs)
            </h2>
            <p className="text-xs text-gray-600 mb-4">
                Add and manage special purpose vehicles (SPVs).
            </p>
            <SPVs {...props} />
            <h2 className="text-lg font-bold mt-4 mb-2">
                Service Provider Fee Types
            </h2>
            <p className="text-xs text-gray-600 mb-4">
                Add and manage service providers and their associated fee types.
            </p>
            <ServiceProviderFeeTypes {...props} />
        </div>
    );
};

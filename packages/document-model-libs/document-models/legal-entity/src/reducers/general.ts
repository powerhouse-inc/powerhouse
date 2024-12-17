/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { LegalEntityGeneralOperations } from '../../gen/general/operations';
import { InputMaybe, LegalEntityId, Maybe } from '../../gen';

export const notNullUndefined = <T>(input: InputMaybe<T>) => {
    if (input !== null && input !== undefined) {
        return input as T;
    } else {
        return false;
    }
};

export const reducer: LegalEntityGeneralOperations = {
    editLegalEntityOperation(state, action, dispatch) {
        try {
            state = {
                ...state,
                address: {
                    city:
                        notNullUndefined(action.input.city) ||
                        state.address?.city ||
                        null,
                    country:
                        notNullUndefined(action.input.country) ||
                        state.address?.country ||
                        null,
                    extendedAddress:
                        notNullUndefined(action.input.extendedAddress) ||
                        state.address?.extendedAddress ||
                        null,
                    postalCode:
                        notNullUndefined(action.input.postalCode) ||
                        state.address?.postalCode ||
                        null,
                    stateProvince:
                        notNullUndefined(action.input.stateProvince) ||
                        state.address?.stateProvince ||
                        null,
                    streetAddress:
                        notNullUndefined(action.input.streetAddress) ||
                        state.address?.streetAddress ||
                        null,
                },
                contactInfo: {
                    tel:
                        notNullUndefined(action.input.tel) ||
                        state.contactInfo?.tel ||
                        null,
                    email:
                        notNullUndefined(action.input.email) ||
                        state.contactInfo?.email ||
                        null,
                },
                country:
                    notNullUndefined(action.input.country) || state.country,
                id: (notNullUndefined(action.input.id) ||
                    state.id) as Maybe<LegalEntityId>,
                name: notNullUndefined(action.input.name) || state.name || null,
            };
        } catch (e) {
            console.error(e);
        }
    },
    editLegalEntityBankOperation(state, action, dispatch) {
        try {
            if (!state.paymentRouting) {
                state.paymentRouting = {
                    bank: null,
                    wallet: null,
                };
            }

            state.paymentRouting.bank = {
                ABA:
                    notNullUndefined(action.input.ABA) ||
                    state.paymentRouting.bank?.ABA ||
                    null,
                IBAN:
                    notNullUndefined(action.input.IBAN) ||
                    state.paymentRouting.bank?.IBAN ||
                    null,
                SWIFT:
                    notNullUndefined(action.input.SWIFT) ||
                    state.paymentRouting.bank?.SWIFT ||
                    null,
                accountNum:
                    notNullUndefined(action.input.accountNum) ||
                    state.paymentRouting.bank?.accountNum ||
                    '',
                accountType:
                    notNullUndefined(action.input.accountType) ||
                    state.paymentRouting.bank?.accountType ||
                    null,
                address: {
                    city:
                        notNullUndefined(action.input.city) ||
                        state.paymentRouting.bank?.address.city ||
                        null,
                    country:
                        notNullUndefined(action.input.country) ||
                        state.paymentRouting.bank?.address.country ||
                        null,
                    extendedAddress:
                        notNullUndefined(action.input.extendedAddress) ||
                        state.paymentRouting.bank?.address.extendedAddress ||
                        null,
                    postalCode:
                        notNullUndefined(action.input.postalCode) ||
                        state.paymentRouting.bank?.address.postalCode ||
                        null,
                    stateProvince:
                        notNullUndefined(action.input.stateProvince) ||
                        state.paymentRouting.bank?.address.stateProvince ||
                        null,
                    streetAddress:
                        notNullUndefined(action.input.streetAddress) ||
                        state.paymentRouting.bank?.address.streetAddress ||
                        null,
                },
                beneficiary:
                    notNullUndefined(action.input.beneficiary) ||
                    state.paymentRouting.bank?.beneficiary ||
                    null,
                name:
                    notNullUndefined(action.input.name) ||
                    state.paymentRouting.bank?.name ||
                    '',
                memo:
                    notNullUndefined(action.input.memo) ||
                    state.paymentRouting.bank?.memo ||
                    null,
                intermediaryBank: {
                    ABA:
                        notNullUndefined(action.input.ABAIntermediary) ||
                        state.paymentRouting.bank?.intermediaryBank?.ABA ||
                        null,
                    IBAN:
                        notNullUndefined(action.input.IBANIntermediary) ||
                        state.paymentRouting.bank?.intermediaryBank?.IBAN ||
                        null,
                    SWIFT:
                        notNullUndefined(action.input.SWIFTIntermediary) ||
                        state.paymentRouting.bank?.intermediaryBank?.SWIFT ||
                        null,
                    accountNum:
                        notNullUndefined(action.input.accountNumIntermediary) ||
                        state.paymentRouting.bank?.intermediaryBank
                            ?.accountNum ||
                        '',
                    accountType:
                        notNullUndefined(
                            action.input.accountTypeIntermediary,
                        ) ||
                        state.paymentRouting.bank?.intermediaryBank
                            ?.accountType ||
                        null,
                    address: {
                        city:
                            notNullUndefined(action.input.cityIntermediary) ||
                            state.paymentRouting.bank?.intermediaryBank?.address
                                .city ||
                            null,
                        country:
                            notNullUndefined(
                                action.input.countryIntermediary,
                            ) ||
                            state.paymentRouting.bank?.intermediaryBank?.address
                                .country ||
                            null,
                        extendedAddress:
                            notNullUndefined(
                                action.input.extendedAddressIntermediary,
                            ) ||
                            state.paymentRouting.bank?.intermediaryBank?.address
                                .extendedAddress ||
                            null,
                        postalCode:
                            notNullUndefined(
                                action.input.postalCodeIntermediary,
                            ) ||
                            state.paymentRouting.bank?.intermediaryBank?.address
                                .postalCode ||
                            null,
                        stateProvince:
                            notNullUndefined(
                                action.input.stateProvinceIntermediary,
                            ) ||
                            state.paymentRouting.bank?.intermediaryBank?.address
                                .stateProvince ||
                            null,
                        streetAddress:
                            notNullUndefined(
                                action.input.streetAddressIntermediary,
                            ) ||
                            state.paymentRouting.bank?.intermediaryBank?.address
                                .streetAddress ||
                            null,
                    },
                    beneficiary:
                        notNullUndefined(
                            action.input.beneficiaryIntermediary,
                        ) ||
                        state.paymentRouting.bank?.intermediaryBank
                            ?.beneficiary ||
                        null,
                    name:
                        notNullUndefined(action.input.nameIntermediary) ||
                        state.paymentRouting.bank?.intermediaryBank?.name ||
                        '',
                    memo:
                        notNullUndefined(action.input.memoIntermediary) ||
                        state.paymentRouting.bank?.intermediaryBank?.memo ||
                        null,
                },
            };
        } catch (e) {
            console.error(e);
        }
    },
    editLegalEntityWalletOperation(state, action, dispatch) {
        try {
            if (!state.paymentRouting) {
                state.paymentRouting = {
                    bank: null,
                    wallet: null,
                };
            }

            state.paymentRouting.wallet = {
                address:
                    notNullUndefined(action.input.address) ||
                    state.paymentRouting.wallet?.address ||
                    null,
                chainId:
                    notNullUndefined(action.input.chainId) ||
                    state.paymentRouting.wallet?.chainId ||
                    null,
                chainName:
                    notNullUndefined(action.input.chainName) ||
                    state.paymentRouting.wallet?.chainName ||
                    null,
                rpc:
                    notNullUndefined(action.input.rpc) ||
                    state.paymentRouting.wallet?.rpc ||
                    null,
            };
        } catch (e) {
            console.error(e);
        }
    },
};

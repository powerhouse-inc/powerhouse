/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { LegalEntityId, Maybe } from 'document-models/invoice/gen';
import { InvoicePartiesOperations } from '../../gen/parties/operations';
import { notNullUndefined } from '../utils';

export const reducer: InvoicePartiesOperations = {
    editIssuerOperation(state, action, dispatch) {
        try {
            state.issuer = {
                ...state.issuer,
                address: {
                    city:
                        notNullUndefined(action.input.city) ||
                        state.issuer.address?.city ||
                        null,
                    country:
                        notNullUndefined(action.input.country) ||
                        state.issuer.address?.country ||
                        null,
                    extendedAddress:
                        notNullUndefined(action.input.extendedAddress) ||
                        state.issuer.address?.extendedAddress ||
                        null,
                    postalCode:
                        notNullUndefined(action.input.postalCode) ||
                        state.issuer.address?.postalCode ||
                        null,
                    stateProvince:
                        notNullUndefined(action.input.stateProvince) ||
                        state.issuer.address?.stateProvince ||
                        null,
                    streetAddress:
                        notNullUndefined(action.input.streetAddress) ||
                        state.issuer.address?.streetAddress ||
                        null,
                },
                contactInfo: {
                    tel:
                        notNullUndefined(action.input.tel) ||
                        state.issuer.contactInfo?.tel ||
                        null,
                    email:
                        notNullUndefined(action.input.email) ||
                        state.issuer.contactInfo?.email ||
                        null,
                },
                country:
                    notNullUndefined(action.input.country) ||
                    state.issuer.country,
                id: (notNullUndefined(action.input.id) ||
                    state.issuer.id) as Maybe<LegalEntityId>,
                name:
                    notNullUndefined(action.input.name) ||
                    state.issuer.name ||
                    null,
            };
        } catch (e) {
            console.error(e);
        }
    },
    editIssuerBankOperation(state, action, dispatch) {
        try {
            if (!state.issuer.paymentRouting) {
                state.issuer.paymentRouting = {
                    bank: null,
                    wallet: null,
                };
            }

            state.issuer.paymentRouting.bank = {
                ABA:
                    notNullUndefined(action.input.ABA) ||
                    state.issuer.paymentRouting.bank?.ABA ||
                    null,
                IBAN:
                    notNullUndefined(action.input.IBAN) ||
                    state.issuer.paymentRouting.bank?.IBAN ||
                    null,
                SWIFT:
                    notNullUndefined(action.input.SWIFT) ||
                    state.issuer.paymentRouting.bank?.SWIFT ||
                    null,
                accountNum:
                    notNullUndefined(action.input.accountNum) ||
                    state.issuer.paymentRouting.bank?.accountNum ||
                    '',
                accountType:
                    notNullUndefined(action.input.accountType) ||
                    state.issuer.paymentRouting.bank?.accountType ||
                    null,
                address: {
                    city:
                        notNullUndefined(action.input.city) ||
                        state.issuer.paymentRouting.bank?.address.city ||
                        null,
                    country:
                        notNullUndefined(action.input.country) ||
                        state.issuer.paymentRouting.bank?.address.country ||
                        null,
                    extendedAddress:
                        notNullUndefined(action.input.extendedAddress) ||
                        state.issuer.paymentRouting.bank?.address
                            .extendedAddress ||
                        null,
                    postalCode:
                        notNullUndefined(action.input.postalCode) ||
                        state.issuer.paymentRouting.bank?.address.postalCode ||
                        null,
                    stateProvince:
                        notNullUndefined(action.input.stateProvince) ||
                        state.issuer.paymentRouting.bank?.address
                            .stateProvince ||
                        null,
                    streetAddress:
                        notNullUndefined(action.input.streetAddress) ||
                        state.issuer.paymentRouting.bank?.address
                            .streetAddress ||
                        null,
                },
                beneficiary:
                    notNullUndefined(action.input.beneficiary) ||
                    state.issuer.paymentRouting.bank?.beneficiary ||
                    null,
                name:
                    notNullUndefined(action.input.name) ||
                    state.issuer.paymentRouting.bank?.name ||
                    '',
                memo:
                    notNullUndefined(action.input.memo) ||
                    state.issuer.paymentRouting.bank?.memo ||
                    null,
                intermediaryBank: {
                    ABA:
                        notNullUndefined(action.input.ABAIntermediary) ||
                        state.issuer.paymentRouting.bank?.intermediaryBank
                            ?.ABA ||
                        null,
                    IBAN:
                        notNullUndefined(action.input.IBANIntermediary) ||
                        state.issuer.paymentRouting.bank?.intermediaryBank
                            ?.IBAN ||
                        null,
                    SWIFT:
                        notNullUndefined(action.input.SWIFTIntermediary) ||
                        state.issuer.paymentRouting.bank?.intermediaryBank
                            ?.SWIFT ||
                        null,
                    accountNum:
                        notNullUndefined(action.input.accountNumIntermediary) ||
                        state.issuer.paymentRouting.bank?.intermediaryBank
                            ?.accountNum ||
                        '',
                    accountType:
                        notNullUndefined(
                            action.input.accountTypeIntermediary,
                        ) ||
                        state.issuer.paymentRouting.bank?.intermediaryBank
                            ?.accountType ||
                        null,
                    address: {
                        city:
                            notNullUndefined(action.input.cityIntermediary) ||
                            state.issuer.paymentRouting.bank?.intermediaryBank
                                ?.address.city ||
                            null,
                        country:
                            notNullUndefined(
                                action.input.countryIntermediary,
                            ) ||
                            state.issuer.paymentRouting.bank?.intermediaryBank
                                ?.address.country ||
                            null,
                        extendedAddress:
                            notNullUndefined(
                                action.input.extendedAddressIntermediary,
                            ) ||
                            state.issuer.paymentRouting.bank?.intermediaryBank
                                ?.address.extendedAddress ||
                            null,
                        postalCode:
                            notNullUndefined(
                                action.input.postalCodeIntermediary,
                            ) ||
                            state.issuer.paymentRouting.bank?.intermediaryBank
                                ?.address.postalCode ||
                            null,
                        stateProvince:
                            notNullUndefined(
                                action.input.stateProvinceIntermediary,
                            ) ||
                            state.issuer.paymentRouting.bank?.intermediaryBank
                                ?.address.stateProvince ||
                            null,
                        streetAddress:
                            notNullUndefined(
                                action.input.streetAddressIntermediary,
                            ) ||
                            state.issuer.paymentRouting.bank?.intermediaryBank
                                ?.address.streetAddress ||
                            null,
                    },
                    beneficiary:
                        notNullUndefined(
                            action.input.beneficiaryIntermediary,
                        ) ||
                        state.issuer.paymentRouting.bank?.intermediaryBank
                            ?.beneficiary ||
                        null,
                    name:
                        notNullUndefined(action.input.nameIntermediary) ||
                        state.issuer.paymentRouting.bank?.intermediaryBank
                            ?.name ||
                        '',
                    memo:
                        notNullUndefined(action.input.memoIntermediary) ||
                        state.issuer.paymentRouting.bank?.intermediaryBank
                            ?.memo ||
                        null,
                },
            };
        } catch (e) {
            console.error(e);
        }
    },
    editIssuerWalletOperation(state, action, dispatch) {
        try {
            if (!state.issuer.paymentRouting) {
                state.issuer.paymentRouting = {
                    bank: null,
                    wallet: null,
                };
            }

            state.issuer.paymentRouting.wallet = {
                address:
                    notNullUndefined(action.input.address) ||
                    state.issuer.paymentRouting.wallet?.address ||
                    null,
                chainId:
                    notNullUndefined(action.input.chainId) ||
                    state.issuer.paymentRouting.wallet?.chainId ||
                    null,
                chainName:
                    notNullUndefined(action.input.chainName) ||
                    state.issuer.paymentRouting.wallet?.chainName ||
                    null,
                rpc:
                    notNullUndefined(action.input.rpc) ||
                    state.issuer.paymentRouting.wallet?.rpc ||
                    null,
            };
        } catch (e) {
            console.error(e);
        }
    },
    editPayerOperation(state, action, dispatch) {
        try {
            state.payer = {
                ...state.payer,
                address: {
                    city:
                        notNullUndefined(action.input.city) ||
                        state.payer.address?.city ||
                        null,
                    country:
                        notNullUndefined(action.input.country) ||
                        state.payer.address?.country ||
                        null,
                    extendedAddress:
                        notNullUndefined(action.input.extendedAddress) ||
                        state.payer.address?.extendedAddress ||
                        null,
                    postalCode:
                        notNullUndefined(action.input.postalCode) ||
                        state.payer.address?.postalCode ||
                        null,
                    stateProvince:
                        notNullUndefined(action.input.stateProvince) ||
                        state.payer.address?.stateProvince ||
                        null,
                    streetAddress:
                        notNullUndefined(action.input.streetAddress) ||
                        state.payer.address?.streetAddress ||
                        null,
                },
                contactInfo: {
                    tel:
                        notNullUndefined(action.input.tel) ||
                        state.payer.contactInfo?.tel ||
                        null,
                    email:
                        notNullUndefined(action.input.email) ||
                        state.payer.contactInfo?.email ||
                        null,
                },
                country:
                    notNullUndefined(action.input.country) ||
                    state.payer.country,
                id: (notNullUndefined(action.input.id) ||
                    state.payer.id) as Maybe<LegalEntityId>,
                name:
                    notNullUndefined(action.input.name) ||
                    state.payer.name ||
                    null,
            };
        } catch (e) {
            console.error(e);
        }
    },
    editPayerBankOperation(state, action, dispatch) {
        try {
            if (!state.payer.paymentRouting) {
                state.payer.paymentRouting = {
                    bank: null,
                    wallet: null,
                };
            }

            state.payer.paymentRouting.bank = {
                ABA:
                    notNullUndefined(action.input.ABA) ||
                    state.payer.paymentRouting.bank?.ABA ||
                    null,
                IBAN:
                    notNullUndefined(action.input.IBAN) ||
                    state.payer.paymentRouting.bank?.IBAN ||
                    null,
                SWIFT:
                    notNullUndefined(action.input.SWIFT) ||
                    state.payer.paymentRouting.bank?.SWIFT ||
                    null,
                accountNum:
                    notNullUndefined(action.input.accountNum) ||
                    state.payer.paymentRouting.bank?.accountNum ||
                    '',
                accountType:
                    notNullUndefined(action.input.accountType) ||
                    state.payer.paymentRouting.bank?.accountType ||
                    null,
                address: {
                    city:
                        notNullUndefined(action.input.city) ||
                        state.payer.paymentRouting.bank?.address.city ||
                        null,
                    country:
                        notNullUndefined(action.input.country) ||
                        state.payer.paymentRouting.bank?.address.country ||
                        null,
                    extendedAddress:
                        notNullUndefined(action.input.extendedAddress) ||
                        state.payer.paymentRouting.bank?.address
                            .extendedAddress ||
                        null,
                    postalCode:
                        notNullUndefined(action.input.postalCode) ||
                        state.payer.paymentRouting.bank?.address.postalCode ||
                        null,
                    stateProvince:
                        notNullUndefined(action.input.stateProvince) ||
                        state.payer.paymentRouting.bank?.address
                            .stateProvince ||
                        null,
                    streetAddress:
                        notNullUndefined(action.input.streetAddress) ||
                        state.payer.paymentRouting.bank?.address
                            .streetAddress ||
                        null,
                },
                beneficiary:
                    notNullUndefined(action.input.beneficiary) ||
                    state.payer.paymentRouting.bank?.beneficiary ||
                    null,
                name:
                    notNullUndefined(action.input.name) ||
                    state.payer.paymentRouting.bank?.name ||
                    '',
                memo:
                    notNullUndefined(action.input.memo) ||
                    state.payer.paymentRouting.bank?.memo ||
                    null,
                intermediaryBank: {
                    ABA:
                        notNullUndefined(action.input.ABAIntermediary) ||
                        state.payer.paymentRouting.bank?.intermediaryBank
                            ?.ABA ||
                        null,
                    IBAN:
                        notNullUndefined(action.input.IBANIntermediary) ||
                        state.payer.paymentRouting.bank?.intermediaryBank
                            ?.IBAN ||
                        null,
                    SWIFT:
                        notNullUndefined(action.input.SWIFTIntermediary) ||
                        state.payer.paymentRouting.bank?.intermediaryBank
                            ?.SWIFT ||
                        null,
                    accountNum:
                        notNullUndefined(action.input.accountNumIntermediary) ||
                        state.payer.paymentRouting.bank?.intermediaryBank
                            ?.accountNum ||
                        '',
                    accountType:
                        notNullUndefined(
                            action.input.accountTypeIntermediary,
                        ) ||
                        state.payer.paymentRouting.bank?.intermediaryBank
                            ?.accountType ||
                        null,
                    address: {
                        city:
                            notNullUndefined(action.input.cityIntermediary) ||
                            state.payer.paymentRouting.bank?.intermediaryBank
                                ?.address.city ||
                            null,
                        country:
                            notNullUndefined(
                                action.input.countryIntermediary,
                            ) ||
                            state.payer.paymentRouting.bank?.intermediaryBank
                                ?.address.country ||
                            null,
                        extendedAddress:
                            notNullUndefined(
                                action.input.extendedAddressIntermediary,
                            ) ||
                            state.payer.paymentRouting.bank?.intermediaryBank
                                ?.address.extendedAddress ||
                            null,
                        postalCode:
                            notNullUndefined(
                                action.input.postalCodeIntermediary,
                            ) ||
                            state.payer.paymentRouting.bank?.intermediaryBank
                                ?.address.postalCode ||
                            null,
                        stateProvince:
                            notNullUndefined(
                                action.input.stateProvinceIntermediary,
                            ) ||
                            state.payer.paymentRouting.bank?.intermediaryBank
                                ?.address.stateProvince ||
                            null,
                        streetAddress:
                            notNullUndefined(
                                action.input.streetAddressIntermediary,
                            ) ||
                            state.payer.paymentRouting.bank?.intermediaryBank
                                ?.address.streetAddress ||
                            null,
                    },
                    beneficiary:
                        notNullUndefined(
                            action.input.beneficiaryIntermediary,
                        ) ||
                        state.payer.paymentRouting.bank?.intermediaryBank
                            ?.beneficiary ||
                        null,
                    name:
                        notNullUndefined(action.input.nameIntermediary) ||
                        state.payer.paymentRouting.bank?.intermediaryBank
                            ?.name ||
                        '',
                    memo:
                        notNullUndefined(action.input.memoIntermediary) ||
                        state.payer.paymentRouting.bank?.intermediaryBank
                            ?.memo ||
                        null,
                },
            };
        } catch (e) {
            console.error(e);
        }
    },
    editPayerWalletOperation(state, action, dispatch) {
        try {
            if (!state.payer.paymentRouting) {
                state.payer.paymentRouting = {
                    bank: null,
                    wallet: null,
                };
            }

            state.payer.paymentRouting.wallet = {
                address:
                    notNullUndefined(action.input.address) ||
                    state.payer.paymentRouting.wallet?.address ||
                    null,
                chainId:
                    notNullUndefined(action.input.chainId) ||
                    state.payer.paymentRouting.wallet?.chainId ||
                    null,
                chainName:
                    notNullUndefined(action.input.chainName) ||
                    state.payer.paymentRouting.wallet?.chainName ||
                    null,
                rpc:
                    notNullUndefined(action.input.rpc) ||
                    state.payer.paymentRouting.wallet?.rpc ||
                    null,
            };
        } catch (e) {
            console.error(e);
        }
    },
};

import { InvoiceState } from 'document-models/invoice';

const mockInvoiceState: InvoiceState = {
    currency: 'USD',
    dateDelivered: '2024-12-15', // keeping this value
    dateDue: '2024-12-31',
    dateIssued: '2024-12-01',
    invoiceNo: 'INV-2024-001',
    title: 'Consulting Services Q4 2024', // keeping this value

    issuer: {
        name: 'Tech Solutions Ltd',
        country: 'USA',
        id: {
            corpRegId: 'CR789012345',
        },
        address: {
            streetAddress: '123 Innovation Drive',
            extendedAddress: 'Suite 400', // keeping this value
            city: 'San Francisco',
            stateProvince: 'CA',
            postalCode: '94105',
            country: 'USA',
        },
        contactInfo: {
            email: 'billing@techsolutions.com',
            tel: '+1-415-555-0123',
        },
        paymentRouting: {
            bank: {
                name: 'Pacific Bank',
                accountNum: '987654321',
                accountType: 'CHECKING',
                ABA: '121000358', // keeping this value
                SWIFT: 'PACAUS6S', // keeping this value
                IBAN: 'US89 PACB 0000 0987 6543 21', // keeping this value
                beneficiary: 'Tech Solutions Ltd', // keeping this value
                address: {
                    streetAddress: '456 Financial Ave',
                    extendedAddress: null,
                    city: 'San Francisco',
                    stateProvince: 'CA',
                    postalCode: '94104',
                    country: 'USA',
                },
                contact: {
                    email: 'support@pacificbank.com',
                    tel: '+1-415-555-0199',
                },
                memo: 'Direct payment for services',
                intermediaryBank: null, // adding this optional field
            },
            wallet: null, // adding this optional field
        },
    },

    payer: {
        name: 'Global Enterprises Inc',
        country: 'USA',
        id: {
            taxId: 'TAX456789012',
        },
        address: {
            streetAddress: '789 Corporate Blvd',
            extendedAddress: null,
            city: 'New York',
            stateProvince: 'NY',
            postalCode: '10001',
            country: 'USA',
        },
        contactInfo: {
            email: 'accounts@globalenterprises.com',
            tel: '+1-212-555-0123',
        },
        paymentRouting: null, // adding this optional field
    },

    lineItems: [
        {
            id: 'LI001',
            description: 'Software Development Services',
            quantity: 160.0,
            unitPriceTaxExcl: 150.0,
            unitPriceTaxIncl: 165.0,
            totalPriceTaxExcl: 24000.0,
            totalPriceTaxIncl: 26400.0,
            taxPercent: 10.0,
            currency: 'USD',
        },
        {
            id: 'LI002',
            description: 'Cloud Infrastructure Setup',
            quantity: 1.0,
            unitPriceTaxExcl: 5000.0,
            unitPriceTaxIncl: 5500.0,
            totalPriceTaxExcl: 5000.0,
            totalPriceTaxIncl: 5500.0,
            taxPercent: 10.0,
            currency: 'USD',
        },
    ],

    refs: [
        {
            id: 'REF001',
            value: 'PO-2024-456',
        },
        {
            id: 'REF002',
            value: 'PROJECT-Q4-2024',
        },
    ],

    status: 'ISSUED',

    totalPriceTaxExcl: 29000.0,
    totalPriceTaxIncl: 31900.0,
};

export default mockInvoiceState;

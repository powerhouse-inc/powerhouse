// test suite for the switchboard hooks

import { useDocumentDriveServer } from '../src/hooks/useDocumentDriveServer';
import { useSwitchboard } from '../src/hooks/useSwitchboard';
import { useUnwrappedReactor } from '../src/store/reactor.js';

describe('Switchboard hooks', () => {
    it('should return the proper switchboard url', async () => {
        const { getSwitchboardGatewayUrl } = useSwitchboard();
        const url = getSwitchboardGatewayUrl('https://example.com/d/123');
        expect(url).toBe('https://example.com/graphql');
    });

    it('should generate the proper query for a document type', async () => {
        // Mock reactor and its getDocumentModelModules method
        const mockReactor = {
            getDocumentModelModules: vi.fn().mockReturnValue([
                {
                    documentModel: {
                        id: 'invoice',
                        name: 'Invoice',
                        specifications: [
                            {
                                state: {
                                    global: {
                                        schema: `
                                            type InvoiceState {
                                                id: String!
                                                amount: Float!
                                                currency: String!
                                            }
                                        `,
                                    },
                                },
                            },
                        ],
                    },
                },
            ]),
        };
        (useUnwrappedReactor as Mock).mockReturnValue(mockReactor);

        const { getDocumentModelGraphQLSchema } = useDocumentDriveServer();
        const query = getDocumentModelGraphQLSchema('invoice');
        expect(query).toBe(
            `query getDocument {
                id
                Invoice {
                    getDocument {
                        state {
                            id
                            amount
                            currency
                        }
                    }
                }
            }`,
        );
    });
});

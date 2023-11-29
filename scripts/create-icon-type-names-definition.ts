import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';

const createTypeDefinition = () => {
    try {
        const svgFilePath = 'public/icons.svg';
        const svgContent = fs.readFileSync(svgFilePath, 'utf8');

        const options = {
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
        };

        const parser = new XMLParser(options);
        const parsed = parser.parse(svgContent) as {
            svg: {
                defs: {
                    symbol:
                        | {
                              '@_id': string;
                          }
                        | {
                              '@_id': string;
                          }[];
                };
            };
        };

        // Extract symbol IDs
        const defs = parsed.svg.defs;
        let symbols = defs.symbol;
        // Ensure symbols is an array
        if (!Array.isArray(symbols)) {
            symbols = [symbols];
        }

        const ids = symbols.map(symbol => symbol['@_id']).sort();

        // Ensure no empty IDs are included
        const validIds = ids.filter(id => id);

        if (validIds.length === 0) {
            throw new Error('No valid IDs found in the SVG file.');
        }

        // Format the type definition
        const typeDef = `export type IconName =\n    | '${validIds.join(
            "'\n    | '",
        )}';\n`;

        const typeDefFilePath = 'src/powerhouse/types/icons.ts';
        fs.writeFileSync(typeDefFilePath, typeDef);

        console.log('Type definition created successfully.');
    } catch (error) {
        console.error('Error creating type definition:', error);
    }
};

createTypeDefinition();

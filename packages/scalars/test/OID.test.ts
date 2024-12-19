import { Kind } from 'graphql';
import { scalar } from '../src/scalars/OID';

describe('OID Scalar', () => {
    it('should serialize a valid OID address', () => {
        const oid = 'b58f0ceb-6b6b-4cc0-9cb2-489fc86580b6';

        expect(scalar.serialize(oid)).toBe(oid);
    });

    it('should throw an error if the value is not a string', () => {
        const oid = 123;

        expect(() => scalar.serialize(oid)).toThrow();
    });

    it('should parse a valid OID address', () => {
        const oid = 'b58f0ceb-6b6b-4cc0-9cb2-489fc86580b6';

        expect(scalar.parseValue(oid)).toBe(oid);
    });

    it('should throw an error if parse a value that is not a string', () => {
        const oid = 123;

        expect(() => scalar.parseValue(oid)).toThrow();
    });

    it('should parse a valid OID address from a literal', () => {
        const oid = 'b58f0ceb-6b6b-4cc0-9cb2-489fc86580b6';

        expect(
            scalar.parseLiteral({
                kind: Kind.STRING,
                value: oid,
            }),
        ).toBe(oid);
    });

    it('should throw an error if parse a literal that is not a string', () => {
        const oid = 'b58f0ceb-6b6b-4cc0-9cb2-489fc86580b6';

        expect(() =>
            scalar.parseLiteral({
                kind: Kind.INT,
                value: oid,
            }),
        ).toThrow();
    });
});

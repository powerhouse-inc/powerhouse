import { Kind } from 'graphql';
import { scalar } from '../src/scalars/URL';

describe('URL Scalar', () => {
    it('should serialize a valid URL address', () => {
        const url = 'https://test.com';

        expect(scalar.serialize(url)).toBe(url);
    });

    it('should throw an error if the value is not a string', () => {
        const url = 123;

        expect(() => scalar.serialize(url)).toThrow();
    });

    it('should throw an error if the value is not a valid email address', () => {
        const url = 'test';

        expect(() => scalar.serialize(url)).toThrow();
    });

    it('should parse a valid URL address', () => {
        const url = 'https://test.com';

        expect(scalar.parseValue(url)).toBe(url);
    });

    it('should throw an error if parse a value that is not a valid URL address', () => {
        const url = 'test';

        expect(() => scalar.parseValue(url)).toThrow();
    });

    it('should throw an error if parse a value that is not a string', () => {
        const url = 123;

        expect(() => scalar.parseValue(url)).toThrow();
    });

    it('should parse a valid URL address from a literal', () => {
        const url = 'https://test.com';

        expect(
            scalar.parseLiteral({
                kind: Kind.STRING,
                value: url,
            }),
        ).toBe(url);
    });

    it('should throw an error if parse a literal that is not a valid URL address', () => {
        const url = 'test';

        expect(() =>
            scalar.parseLiteral({
                kind: Kind.STRING,
                value: url,
            }),
        ).toThrow();
    });

    it('should throw an error if parse a literal that is not a string', () => {
        const url = 'test';

        expect(() =>
            scalar.parseLiteral({
                kind: Kind.INT,
                value: url,
            }),
        ).toThrow();
    });
});

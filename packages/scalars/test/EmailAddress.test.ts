import { Kind } from 'graphql';
import { GraphQLEmailAddress } from '../src/scalars/EmailAddress';

describe('EmailAddress Scalar', () => {
    it('should serialize an email address', () => {
        const email = 'test@test.com';

        expect(GraphQLEmailAddress.serialize(email)).toBe(email);
    });

    it('should throw an error if the value is not a string', () => {
        const email = 123;

        expect(() => GraphQLEmailAddress.serialize(email)).toThrow();
    });

    it('should throw an error if the value is not a valid email address', () => {
        const email = 'test';

        expect(() => GraphQLEmailAddress.serialize(email)).toThrow();
    });

    it('should parse a valid email address', () => {
        const email = 'test@test.com';

        expect(GraphQLEmailAddress.parseValue(email)).toBe(email);
    });

    it('should throw an error if parse a value that is not a valid email address', () => {
        const email = 'test';

        expect(() => GraphQLEmailAddress.parseValue(email)).toThrow();
    });

    it('should throw an error if parse a value that is not a string', () => {
        const email = 123;

        expect(() => GraphQLEmailAddress.parseValue(email)).toThrow();
    });

    it('should parse a valid email address from a literal', () => {
        const email = 'test@test.com';

        expect(
            GraphQLEmailAddress.parseLiteral({
                kind: Kind.STRING,
                value: email,
            }),
        ).toBe(email);
    });

    it('should throw an error if parse a literal that is not a valid email address', () => {
        const email = 'test';

        expect(() =>
            GraphQLEmailAddress.parseLiteral({
                kind: Kind.STRING,
                value: email,
            }),
        ).toThrow();
    });

    it('should throw an error if parse a literal that is not a string', () => {
        const email = 'test';

        expect(() =>
            GraphQLEmailAddress.parseLiteral({
                kind: Kind.INT,
                value: email,
            }),
        ).toThrow();
    });
});

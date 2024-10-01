import { getDifferences } from '../utils';

describe('getDifferences', () => {
    it('should detect changes in primitive fields', () => {
        const obj1 = { name: 'Alice', age: 30 };
        const obj2 = { name: 'Bob', age: 30 };
        expect(getDifferences(obj1, obj2)).toEqual({ name: 'Bob' });
    });

    it('should detect changes in nested objects', () => {
        const obj1 = {
            name: 'Alice',
            address: { city: 'Townsville', street: '123 Main St' },
        };
        const obj2 = {
            name: 'Alice',
            address: { city: 'Elsewhere', street: '123 Main St' },
        };
        expect(getDifferences(obj1, obj2)).toEqual({
            address: { city: 'Elsewhere', street: '123 Main St' },
        });
    });

    it('should return {} if there are no differences', () => {
        const obj1 = { name: 'Alice', age: 30 };
        const obj2 = { name: 'Alice', age: 30 };
        expect(getDifferences(obj1, obj2)).toEqual({});
    });

    it('should detect additions and deletions in objects', () => {
        const obj1 = { name: 'Alice' };
        const obj2 = { name: 'Alice', age: 31 }; // Age added
        const obj3 = { age: 31 }; // Name removed
        expect(getDifferences(obj1, obj2)).toEqual({ age: 31 });
        // @ts-expect-error mock
        expect(getDifferences(obj1, obj3)).toEqual({
            name: undefined,
            age: 31,
        });
    });

    // Test for detecting changes within arrays of objects
    it('should return the entire new array if any element has changed', () => {
        const obj1 = {
            users: [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' },
            ],
        };
        const obj2 = {
            users: [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Robert' },
            ],
        };
        expect(getDifferences(obj1, obj2)).toEqual({ users: obj2.users });
    });

    // Test for no changes in arrays
    it('should not return the array if there are no changes', () => {
        const obj1 = { hobbies: ['reading', 'gardening'] };
        const obj2 = { hobbies: ['reading', 'gardening'] };
        expect(getDifferences(obj1, obj2)).toEqual({});
    });
});

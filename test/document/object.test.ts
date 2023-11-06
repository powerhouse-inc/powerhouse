import { DocumentModel } from '../../src/document-model';

it('should return a read only object on toDocument', () => {
    const model = new DocumentModel();

    expect(model.state.id).toBe('');

    const document = model.toDocument();

    expect(() => {
        // @ts-expect-error Cannot assign to 'id' because it is a read-only property.
        document.state.id = 'test';
    }).toThrowError(
        "Cannot assign to read only property 'id' of object '#<Object>'",
    );
    expect(model.state.id).toBe('');
});

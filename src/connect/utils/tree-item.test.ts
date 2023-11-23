import { decodeID, encodeID } from './tree-item';

describe('Utils', () => {
    describe('encodeID', () => {
        it('should encode id', () => {
            expect(encodeID('my-dr+ive/id')).toBe('my-dr:PLUS:ive:SLASH:id');
            expect(encodeID('root/folder/docs')).toBe(
                'root:SLASH:folder:SLASH:docs',
            );
            expect(encodeID('root/folder/docs/file')).toBe(
                'root:SLASH:folder:SLASH:docs:SLASH:file',
            );
            expect(encodeID('/+.$*^?')).toBe(
                ':SLASH::PLUS::DOT::DOLLAR::ASTERISK::CARET::QUESTIONMARK:',
            );
        });

        it('should not encode id if it does not contain slash', () => {
            expect(encodeID('root')).toBe('root');
        });
    });

    describe('decodeID', () => {
        it('should decode id', () => {
            expect(decodeID('my-drive:SLASH:id')).toBe('my-drive/id');
            expect(decodeID('root:SLASH:folder:SLASH:docs')).toBe(
                'root/folder/docs',
            );
            expect(
                decodeID('root:SLASH:folder:SLASH:docs:SLASH:fil:PLUS:e'),
            ).toBe('root/folder/docs/fil+e');
            expect(
                decodeID(
                    ':SLASH::PLUS::DOT::DOLLAR::ASTERISK::CARET::QUESTIONMARK:',
                ),
            ).toBe('/+.$*^?');
        });

        it('should not decode id if it does not contain slash', () => {
            expect(decodeID('root')).toBe('root');
        });
    });
});

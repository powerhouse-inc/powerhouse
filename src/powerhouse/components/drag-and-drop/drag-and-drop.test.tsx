import { render, screen } from '@testing-library/react';

import { Draggable } from './draggable';
import { DraggableTarget } from './draggable-target';
import { DropTarget } from './drop-target';

describe('DragAndDrop Components', () => {
    describe('Draggable', () => {
        it('should match snapshot', () => {
            const { asFragment } = render(
                <Draggable item={{ id: 'item-1' }}>
                    {() => <div style={{ width: '100px', height: '100px' }} />}
                </Draggable>,
            );

            expect(asFragment()).toMatchSnapshot();
        });

        it('should call children render prop function', () => {
            const children = jest.fn();

            render(<Draggable item={{ id: 'item-1' }}>{children}</Draggable>);

            expect(children).toHaveBeenCalled();
            expect(children).toHaveBeenCalledWith({ isDragging: false });
        });

        it('should inject props to the div wrapper element', () => {
            render(
                <Draggable item={{ id: 'item-1' }} data-testid="draggable-node">
                    {() => <div style={{ width: '100px', height: '100px' }} />}
                </Draggable>,
            );

            expect(screen.getByTestId('draggable-node')).toBeDefined();
        });
    });

    describe('DropTarget', () => {
        it('should match snapshot', () => {
            const onDropEvent = jest.fn();

            const { asFragment } = render(
                <DropTarget target={{ id: 'item-1' }} onDropEvent={onDropEvent}>
                    {() => <div style={{ width: '100px', height: '100px' }} />}
                </DropTarget>,
            );

            expect(asFragment()).toMatchSnapshot();
        });

        it('should call children render prop function', () => {
            const children = jest.fn();
            const onDropEvent = jest.fn();

            render(
                <DropTarget target={{ id: 'item-1' }} onDropEvent={onDropEvent}>
                    {children}
                </DropTarget>,
            );

            expect(children).toHaveBeenCalled();
            expect(children).toHaveBeenCalledWith({ isDropTarget: false });
        });

        it('should inject props to the div wrapper element', () => {
            const onDropEvent = jest.fn();

            render(
                <DropTarget
                    target={{ id: 'item-1' }}
                    onDropEvent={onDropEvent}
                    data-testid="drop-target-node"
                >
                    {() => <div style={{ width: '100px', height: '100px' }} />}
                </DropTarget>,
            );

            expect(screen.getByTestId('drop-target-node')).toBeDefined();
        });
    });

    describe('DraggableTarget', () => {
        it('should match snapshot', () => {
            const { asFragment } = render(
                <DraggableTarget item={{ id: 'item-1' }} onDropEvent={() => {}}>
                    {() => <div style={{ width: '100px', height: '100px' }} />}
                </DraggableTarget>,
            );

            expect(asFragment()).toMatchSnapshot();
        });

        it('should call children render prop function', () => {
            const children = jest.fn();
            const onDropEvent = jest.fn();

            render(
                <DraggableTarget
                    item={{ id: 'item-1' }}
                    onDropEvent={onDropEvent}
                >
                    {children}
                </DraggableTarget>,
            );

            expect(children).toHaveBeenCalled();
            expect(children).toHaveBeenCalledWith({
                isDragging: false,
                isDropTarget: false,
            });
        });

        it('should inject props to the div wrapper elements', () => {
            const onDropEvent = jest.fn();

            render(
                <DraggableTarget
                    item={{ id: 'item-1' }}
                    onDropEvent={onDropEvent}
                    targetNodeProps={{ id: 'target-node', className: 'target' }}
                    dragNodeProps={{
                        id: 'draggable-node',
                        className: 'draggable',
                    }}
                >
                    {() => <div style={{ width: '100px', height: '100px' }} />}
                </DraggableTarget>,
            );

            const targetComponent = document.querySelector('#target-node');
            const draggableComponent =
                document.querySelector('#draggable-node');

            expect(targetComponent).toBeDefined();
            expect(targetComponent).toHaveClass('target');
            expect(draggableComponent).toBeDefined();
            expect(draggableComponent).toHaveClass('draggable');
        });
    });
});

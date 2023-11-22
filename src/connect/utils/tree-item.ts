import { RefObject } from 'react';

export function getIsMouseInsideContainer(
    containerRef: RefObject<HTMLElement>,
    event: MouseEvent,
) {
    if (!containerRef.current) return false;
    const dimensions = containerRef.current.getBoundingClientRect();

    const { x, y, width, height } = dimensions;

    const mouseX = event.clientX;
    const mouseY = event.clientY;

    const isWithinX = mouseX >= x && mouseX <= x + width;
    const isWithinY = mouseY >= y && mouseY <= y + height;

    const isWithinContainer = isWithinX && isWithinY;

    return isWithinContainer;
}

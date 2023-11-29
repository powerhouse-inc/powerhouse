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

type ReplacementsType = {
    encode: [RegExp, string];
    decode: [RegExp, string];
}[];

const replacements: ReplacementsType = [
    {
        encode: [/\//g, ':SLASH:'],
        decode: [/:SLASH:/g, '/'],
    },
    {
        encode: [/\+/g, ':PLUS:'],
        decode: [/:PLUS:/g, '+'],
    },
    {
        encode: [/\./g, ':DOT:'],
        decode: [/:DOT:/g, '.'],
    },
    {
        encode: [/\$/g, ':DOLLAR:'],
        decode: [/:DOLLAR:/g, '$'],
    },
    {
        encode: [/\*/g, ':ASTERISK:'],
        decode: [/:ASTERISK:/g, '*'],
    },
    {
        encode: [/\^/g, ':CARET:'],
        decode: [/:CARET:/g, '^'],
    },
    {
        encode: [/\?/g, ':QUESTIONMARK:'],
        decode: [/:QUESTIONMARK:/g, '?'],
    },
];

export const encodeID = (id: string) => {
    let encodedID = id;

    replacements.forEach(({ encode }) => {
        const [regexp, replaceWith] = encode;
        encodedID = encodedID.replace(regexp, replaceWith);
    });

    return encodedID;
};

export const decodeID = (id: string) => {
    let decodedID = id;

    replacements.forEach(({ decode }) => {
        const [regexp, replaceWith] = decode;
        decodedID = decodedID.replace(regexp, replaceWith);
    });

    return decodedID;
};

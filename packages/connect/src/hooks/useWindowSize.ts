import { useEffect, useState } from 'react';

export const useWindowSize = () => {
    const [windowSize, setWindowSize] = useState({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
    });

    useEffect(() => {
        const windowSizeHandler = () => {
            setWindowSize({
                innerWidth: window.innerWidth,
                innerHeight: window.innerHeight,
            });
        };

        window.addEventListener('resize', windowSizeHandler);

        return () => {
            window.removeEventListener('resize', windowSizeHandler);
        };
    }, []);

    return windowSize;
};

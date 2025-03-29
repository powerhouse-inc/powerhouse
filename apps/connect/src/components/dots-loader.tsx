import { useEffect, useState } from 'react';

export const DotsLoader = () => {
    const [dots, setDots] = useState(0);

    useEffect(() => {
        const id = setInterval(() => {
            setDots(dots => (dots === 3 ? 0 : dots + 1));
        }, 200);
        return () => {
            clearInterval(id);
        };
    }, []);

    return <span>{new Array(dots).fill('.').join('')}</span>;
};

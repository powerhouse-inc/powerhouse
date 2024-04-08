export function getDifferences<T extends object>(
    obj1: T | undefined | null,
    obj2: Partial<T> | undefined | null,
): Partial<T> {
    if (!obj1 || !obj2) return {};

    const differences: Partial<T> = {};

    function isObject(value: any): value is object {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    const compare = (value1: any, value2: any): boolean => {
        if (isObject(value1) && isObject(value2)) {
            // Convert both objects to JSON strings to compare them as a whole.
            const keys1 = Object.keys(value1).sort();
            const keys2 = Object.keys(value2).sort();
            if (
                JSON.stringify(keys1) !== JSON.stringify(keys2) ||
                keys1.some(key =>
                    compare(
                        value1[key as keyof typeof value1],
                        value2[key as keyof typeof value1],
                    ),
                )
            ) {
                return true; // Any difference in object structure or value means they're different.
            }
            return false;
        } else if (Array.isArray(value1) && Array.isArray(value2)) {
            // For arrays, compare their serialized forms.
            return JSON.stringify(value1) !== JSON.stringify(value2);
        } else {
            // For primitives, compare directly.
            return value1 !== value2;
        }
    };

    for (const key of new Set([...Object.keys(obj1), ...Object.keys(obj2)])) {
        if (
            compare(
                obj1[key as keyof typeof obj1],
                obj2[key as keyof typeof obj2],
            )
        ) {
            differences[key as keyof typeof differences] =
                obj2[key as keyof typeof obj2];
        }
    }

    return Object.entries(differences).reduce<Partial<T>>(
        (acc, [key, value]) => {
            if (value !== undefined) {
                // @ts-expect-error generic cannot be inferred
                acc[key] = value;
            }
            return acc;
        },
        {} as Partial<T>,
    );
}

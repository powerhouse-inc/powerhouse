type AsyncFunction<T> = (...args: any[]) => Promise<T>;

export function executeOnce<T>(fn: AsyncFunction<T>): AsyncFunction<T> {
    let resultPromise: Promise<T> | null = null;
    let hasExecuted = false;

    return async function (...args: any[]): Promise<T> {
        if (!hasExecuted) {
            hasExecuted = true;
            resultPromise = fn(...args);
        }

        return await resultPromise!;
    };
}

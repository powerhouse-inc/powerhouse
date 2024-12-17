export function join(...paths: string[]) {
    const cleanPaths = paths
        .map(path => {
            return path.startsWith('/') ? path.slice(1) : path;
        })
        .map(path => {
            return path.endsWith('/') ? path.slice(0, -1) : path;
        });

    return cleanPaths.join('/');
}

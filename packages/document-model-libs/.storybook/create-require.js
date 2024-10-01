export function createRequire() {
    return (modulePath) => import(modulePath);
}

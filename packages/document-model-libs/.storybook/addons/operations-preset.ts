function managerEntries(entry = []) {
    return [...entry, require.resolve('./operations.tsx')];
}

export default { managerEntries };

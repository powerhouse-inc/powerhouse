export function makeNodeSlugFromNodeName(name: string) {
    return name.replaceAll(/\s/g, '-');
}

export const typedocSidebar = {
  type: "category",
  label: "Packages",
  link: {
    type: "doc",
    id: "packages/index",
  }, // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports
  items: require(`./docs/packages/typedoc-sidebar.cjs`),
};

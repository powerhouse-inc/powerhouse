import { Box, Layers } from "lucide-react";
import type { Registry } from "../src/shell/registry.js";

const page = (text: string) => () => <p>{text}</p>;

export const TEST_REGISTRY: Registry = {
  groups: [
    { id: "one", label: "Group one" },
    { id: "two", label: "Group two" },
  ],
  panels: [
    {
      id: "alpha",
      title: "Alpha",
      icon: Box,
      group: "one",
      tabs: [{ id: "alpha", title: "Alpha", component: page("alpha page") }],
    },
    {
      id: "beta",
      title: "Beta",
      icon: Layers,
      group: "two",
      defaultTab: () => "second",
      tabs: [
        { id: "first", title: "First", component: page("beta first tab") },
        { id: "second", title: "Second", component: page("beta second tab") },
      ],
    },
  ],
};

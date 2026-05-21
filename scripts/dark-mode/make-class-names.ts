import { writeFileSync } from "node:fs";
import { map, mergeAll, objOf } from "remeda";

const colors = [
  "zinc",
  "yellow",
  "violet",
  "slate",
  "red",
  "purple",
  "orange",
  "green",
  "cyan",
  "blue",
  "amber",
];

const rules: [string, string][] = [
  ["900", "50"],
  ["800", "100"],
  ["700", "200"],
  ["600", "300"],
  ["500", "400"],
  ["400", "500"],
  ["300", "600"],
  ["200", "700"],
  ["100", "800"],
  ["50", "900"],
];

const makeRule = (color: string, prefix: string, ruleTuple: [string, string]) =>
  objOf(
    `${prefix}-${color}-${ruleTuple[1]}`,
    `${prefix}-${color}-${ruleTuple[0]}`,
  );

const makeRules = (color: string, prefix: string) =>
  mergeAll(map(rules, (ruleTuple) => makeRule(color, prefix, ruleTuple)));

const obj = mergeAll(map(colors, (color) => makeRules(color, "border")));
writeFileSync(
  "scripts/dark-mode/generated-rules.json",
  JSON.stringify(obj, null, 2),
);

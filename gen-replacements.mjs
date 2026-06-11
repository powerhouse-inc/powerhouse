import { readFileSync, writeFileSync } from "node:fs";

const { allClasses } = JSON.parse(readFileSync("./all-classes.json", "utf8"));

// grayscale border consolidation -> two buckets: subtle (border) + strong (foreground)
// light = gray, dark = slate
const borderRemap = {
  gray: { 50: 300, 100: 300, 200: 300, 400: 300, 500: 300, 700: 900, 800: 900 }, // 300 & 900 stay
  slate: { 100: 50, 200: 50, 300: 500, 400: 500, 600: 500, 800: 500 }, // 500 & 50 stay
};

const re = /^(.+-)border-(gray|slate)-(\d+)$|^border-(gray|slate)-(\d+)$/;

const remapClass = (cls) => {
  const parts = cls.split(":");
  const utility = parts.pop();
  const m = utility.match(/^border-(gray|slate)-(\d+)$/);
  if (!m) return null;
  const [, hue, shade] = m;
  const newShade = borderRemap[hue]?.[Number(shade)] ?? Number(shade);
  if (newShade === Number(shade)) return null;
  const next = [...parts, `border-${hue}-${newShade}`].join(":");
  return next === cls ? null : next;
};

const replacements = {};
for (const cls of allClasses) {
  const next = remapClass(cls);
  if (next) replacements[cls] = next;
}

writeFileSync("./class-replacements.json", JSON.stringify(replacements, null, 2) + "\n");
console.log(`${Object.keys(replacements).length} replacements written`);

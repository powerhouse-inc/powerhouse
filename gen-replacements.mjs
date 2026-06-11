import { readFileSync, writeFileSync } from "node:fs";

const { allClasses } = JSON.parse(readFileSync("./all-classes.json", "utf8"));

// grayscale borders -> two buckets: subtle (300/500) + strong (900/50)
const grayBucket = { 50: 300, 100: 300, 200: 300, 400: 300, 500: 300, 700: 900, 800: 900 };
const slateBucket = { 100: 50, 200: 50, 300: 500, 400: 500, 600: 500, 800: 500 };
// colored borders -> {50,100,500,900}
const fold = { 200: 100, 300: 500, 400: 500, 600: 500, 700: 900, 800: 900 };

const shadeFor = (hue, shade) => {
  if (hue === "gray") return grayBucket[shade] ?? shade;
  if (hue === "slate") return slateBucket[shade] ?? shade;
  return fold[shade] ?? shade;
};

const remapClass = (cls) => {
  const parts = cls.split(":");
  const utility = parts.pop();
  const m = utility.match(/^border-([a-z]+)-(\d+)(!?)$/);
  if (!m) return null;
  const hue = m[1];
  const shade = Number(m[2]);
  const bang = m[3];
  const newShade = shadeFor(hue, shade);
  if (newShade === shade) return null;
  const next = [...parts, `border-${hue}-${newShade}${bang}`].join(":");
  return next === cls ? null : next;
};

const replacements = {};
for (const cls of allClasses) {
  const next = remapClass(cls);
  if (next) replacements[cls] = next;
}

writeFileSync("./class-replacements.json", JSON.stringify(replacements, null, 2) + "\n");
console.log(`${Object.keys(replacements).length} replacements written`);

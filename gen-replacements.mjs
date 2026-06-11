import { readFileSync, writeFileSync } from "node:fs";

const { allClasses } = JSON.parse(readFileSync("./all-classes.json", "utf8"));

// non-gray hues converge to {50, 500, 900}
const fold = { 100: 50, 200: 50, 300: 500, 400: 500, 600: 500, 700: 900, 800: 900 };
const grayscale = new Set(["gray", "slate", "white", "black", "transparent"]);
const HUES =
  "stone|gray|slate|blue|green|red|orange|yellow|amber|purple|violet|cyan|white|black|transparent";
const re = new RegExp(`^(.+?)-(${HUES})(?:-(\\d+))?(\\/\\d+)?(!)?$`);

const remapClass = (cls) => {
  const parts = cls.split(":");
  const utility = parts.pop();
  const m = utility.match(re);
  if (!m) return null;
  const [, property, hue, shade, opacity = "", bang = ""] = m;
  if (!shade || grayscale.has(hue)) return null;
  const newShade = fold[Number(shade)] ?? Number(shade);
  if (newShade === Number(shade)) return null;
  const next = [...parts, `${property}-${hue}-${newShade}${opacity}${bang}`].join(":");
  return next === cls ? null : next;
};

const replacements = {};
for (const cls of allClasses) {
  const next = remapClass(cls);
  if (next) replacements[cls] = next;
}

writeFileSync("./class-replacements.json", JSON.stringify(replacements, null, 2) + "\n");
console.log(`${Object.keys(replacements).length} replacements written`);

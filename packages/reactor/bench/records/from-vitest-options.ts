export const FROM_VITEST_USAGE = `Converts one vitest bench --outputJson report into a micro benchmark entry,
printed as a single JSON object on stdout. Nothing is written: pipe it into
\`bench:records add-benchmark -\`.

Usage:
  pnpm bench:records:from-vitest <benchmark|path> [flags]

  <benchmark>   one of the names below, whose results file is read from
                bench/results
  <path>        a path to a vitest --outputJson report

  --conclusion <text>  append a claim of your own, repeatable
  --caveat <text>      append a limit of your own, repeatable
  --title <text>       override the benchmark's title
  --question <text>    override the question it answers
  --tag <text>         repeatable
  --task <T-nnn>       the task this run bears on, repeatable
  --supersedes <B-nnn> a record this run replaces, repeatable. Use it when a
                       harness fix changed what the numbers mean, so the older
                       entry is not a comparable baseline
  --allow-dirty        record against a working tree with uncommitted changes

The conclusions and caveats an entry starts with are derived from the numbers:
one spread per set of cases in a suite that state the same size, in the units
the target's sizeUnits declare, or a note that the suite has no such pair, plus a caveat for every case whose
relative margin of error exceeds 5% or whose sample count is under 100. Your
own text is appended to those, never in place of them.

A case whose name ends in [reference] is a reference cost rather than a point on
its suite's sweep: no spread pairs it, and it gets a conclusion of its own that
states its rate. Mark the case in the bench file and add the rename to the
target's \`renames\`, so the record says which case it continues.

A set of three or more such cases gets no fastest-over-slowest spread, which
would drop every case between the two ends. It pairs only the adjacent steps
the target's \`spreadChains\` declare, and the conversion fails when a case in
it sits on no declared step and is not marked [reference].

A dirty tree is refused. The entry is stamped with the current commit, and on
a dirty tree that sha describes code that did not run.`;

export type FromVitestOptions = {
  target: string;
  conclusions: string[];
  caveats: string[];
  title: string;
  question: string;
  tags: string[];
  tasks: string[];
  supersedes: string[];
  allowDirty: boolean;
};

const REPEATABLE = new Set([
  "--conclusion",
  "--caveat",
  "--tag",
  "--task",
  "--supersedes",
]);
const SINGLE = new Set(["--title", "--question"]);

/** Parses the caller's arguments, or throws with what is wrong. */
export function parseFromVitestOptions(argv: string[]): FromVitestOptions {
  const options: FromVitestOptions = {
    target: "",
    conclusions: [],
    caveats: [],
    title: "",
    question: "",
    tags: [],
    tasks: [],
    supersedes: [],
    allowDirty: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];

    if (argument === "--allow-dirty") {
      options.allowDirty = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      if (options.target !== "") {
        throw new Error(
          `Only one benchmark at a time, got ${argument} as well`,
        );
      }
      options.target = argument;
      continue;
    }
    if (!REPEATABLE.has(argument) && !SINGLE.has(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }

    const value = argv.at(i + 1);
    if (value === undefined || value === "") {
      throw new Error(`Missing value for ${argument}`);
    }
    i += 1;

    switch (argument) {
      case "--conclusion":
        options.conclusions.push(value);
        break;
      case "--caveat":
        options.caveats.push(value);
        break;
      case "--tag":
        options.tags.push(value);
        break;
      case "--task":
        options.tasks.push(value);
        break;
      case "--supersedes":
        options.supersedes.push(value);
        break;
      case "--title":
        options.title = value;
        break;
      default:
        options.question = value;
        break;
    }
  }

  if (options.target === "") {
    throw new Error("A benchmark name or a results path is required");
  }
  return options;
}

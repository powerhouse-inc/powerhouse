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
  --allow-dirty        record against a working tree with uncommitted changes

The conclusions and caveats an entry starts with are derived from the numbers:
one spread per suite, plus a caveat for every case whose relative margin of
error exceeds 5% or whose sample count is under 100. Your own text is appended
to those, never in place of them.

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
  allowDirty: boolean;
};

const REPEATABLE = new Set(["--conclusion", "--caveat", "--tag", "--task"]);
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

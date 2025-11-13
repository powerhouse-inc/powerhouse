- Before you start on a task, read the specs in the `docs/planning` folder.

- Always use pnpm, never use npm or yarn.
- Never add comments inside of function, only on function and class declarations.
- When making changes to a package, but running tests in a different package, always run `pnpm tsc --build` in the package you are working on first.
- Always use `pnpm claude` to build, test, and lint this package.
- Your task is not accomplished until you have run `pnpm claude` and all tests pass and linting errors are fixed.

- Never use `any` or `unknown` types. Always use named types instead.
- Prefer named types and classical OOP over Pick, Omit, etc.
- When handling async operations, do not put more than one `await` inside a single try/catch block. Use separate try/catch blocks for each await so that errors can be made explicit.
- When working on a class implementation, always group public functions together, and private functions together. Public functions should come first.
- Prefer required fields and parameters over optional fields and parameters.
- Prefer default values, empty implementations, etc. instead of using null or undefined.
- Never use emojis in comments, code, or documentation.
- If you are working from a checklist or implementation plan, always check the boxes as you complete the tasks.

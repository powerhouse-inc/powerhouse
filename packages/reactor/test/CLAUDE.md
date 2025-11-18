- Read all docs in the `docs/planning` folder as a prerequisite for all tasks.

# Test Organization

- **Unit tests**: Test a single component with mocked dependencies. Named `<component>/unit.test.ts`
- **Integration tests**: Test a component with real implementations of dependencies. Named `<component>/integration.test.ts`
- Components with no dependencies only need unit tests (e.g., `job-tracker/unit.test.ts`)
- The `integration/` folder contains reactor-level integration tests across multiple subsystems

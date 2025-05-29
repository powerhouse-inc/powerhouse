# Benchmarks

This directory contains performance benchmarks for the document-drive package using Vitest's built-in benchmarking capabilities.

## Running Benchmarks

```bash
# Run all benchmarks
pnpm run bench
```

This will execute all benchmark files (`.bench.ts`) and display detailed performance metrics including operations per second (hz), execution times, and statistical analysis.

## Writing Benchmarks

Benchmarks use Vitest's `bench` function to measure performance. Here's the basic structure:

```typescript
import { bench, describe } from 'vitest';

describe('My Component Benchmarks', () => {
  bench('operation name', async () => {
    // Code to benchmark
  }, { time: 500 }); // Run for 500ms
});
```

### Example: EventBus Benchmarks

The `event-bus.bench.ts` file demonstrates comprehensive benchmarking patterns:

```typescript
import { bench, describe } from 'vitest';
import { EventBus } from '../../src/events/event-bus.js';

describe('EventBus Sync Emission Throughput', () => {
  const eventBus = new EventBus();
  // Setup code here...

  bench('1 sync subscriber', async () => {
    await eventBus.emit(EVENT_TYPE_SYNC, TEST_DATA);
  }, { time: 500 });

  bench('5 sync subscribers', async () => {
    await eventBus.emit(EVENT_TYPE_SYNC, TEST_DATA);
  }, { time: 500 });
});
```

## Understanding Results

### Metrics Explained

- **hz**: Operations per second (higher is better)
- **min/max/mean**: Execution time statistics in milliseconds
- **p75/p99/p995/p999**: Percentile measurements
- **rme**: Relative margin of error as a percentage

### Sample Output

```
 ✓ EventBus Sync Emission Throughput > 1 sync subscriber 6,526,368.12 hz
 ✓ EventBus Sync Emission Throughput > 5 sync subscribers 3,010,461.78 hz
 ✓ Component Performance > method call 1,234,567.89 hz
```

## Benchmark Configuration

### Basic Configuration

Each benchmark can specify timing options:

```typescript
bench('test name', () => {
  // benchmark code
}, { 
  time: 500,           // Run for 500ms
  iterations: 100,     // Minimum iterations
  warmupTime: 100,     // Warmup time in ms
  warmupIterations: 5  // Minimum warmup iterations
});
```

### Setup and Teardown

Use setup and teardown for expensive operations:

```typescript
bench('test with setup', () => {
  // benchmark code
}, {
  setup() {
    // Expensive setup code (not measured)
  },
  teardown() {
    // Cleanup code (not measured)
  }
});
```

## Best Practices

### 1. Isolate What You're Measuring

```typescript
// Good: Only measure the operation you care about
const eventBus = new EventBus(); // Setup outside
bench('emit event', () => {
  eventBus.emit(1, data);
});

// Bad: Includes setup in measurement
bench('emit event', () => {
  const eventBus = new EventBus(); // This gets measured!
  eventBus.emit(1, data);
});
```

### 2. Use Realistic Data

```typescript
// Use realistic data sizes and complexity
const largePayload = generateRealisticData(1000);
const smallPayload = generateRealisticData(10);

bench('process large payload', () => {
  processor.handle(largePayload);
});
```

### 3. Test Different Scenarios

```typescript
describe('Database Operations', () => {
  bench('single insert', () => { /* ... */ });
  bench('batch insert (10)', () => { /* ... */ });
  bench('batch insert (100)', () => { /* ... */ });
  bench('batch insert (1000)', () => { /* ... */ });
});
```

### 4. Organize by Component

Structure benchmarks by the component or feature being tested:

```
test/benchmarks/
├── event-bus.bench.ts
├── storage.bench.ts
├── document-operations.bench.ts
└── network.bench.ts
```

## Performance Analysis

### Comparing Results

- Focus on relative performance differences rather than absolute numbers
- Look for performance regressions when making changes
- Consider the practical impact of performance differences

### Factors Affecting Results

- System load and available resources
- Node.js version and V8 optimizations
- Memory pressure and garbage collection
- Network conditions (for I/O operations)

## Troubleshooting

### Common Issues

1. **Inconsistent Results**: Run benchmarks multiple times and look for patterns
2. **Memory Leaks**: Use setup/teardown to clean up resources
3. **Async Operations**: Ensure proper `await` usage in async benchmarks

### Tips for Reliable Benchmarks

- Close other applications to reduce system noise
- Run benchmarks multiple times to establish baselines
- Use longer benchmark times for more stable results
- Consider using CI environments for consistent results

## Adding New Benchmarks

1. Create a new `.bench.ts` file in this directory
2. Import necessary dependencies and the code to benchmark
3. Use `describe` blocks to group related benchmarks
4. Use `bench` functions to define individual performance tests
5. Include realistic test scenarios and data
6. Document any special setup or considerations 
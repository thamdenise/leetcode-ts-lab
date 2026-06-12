# LeetCode TypeScript Lab

A small TypeScript CLI for practicing LeetCode problems locally.

This project fetches a LeetCode problem, creates a local TypeScript workspace for it, runs your solution against editable test cases, and performs a lightweight complexity check against the expected time and space profile.

## Why I Built This

I wanted a repeatable way to solve LeetCode problems outside the browser while still keeping the useful parts of the LeetCode workflow:

- problem-specific folders
- TypeScript starter files
- local test cases I can edit
- quick correctness checks
- a rough signal for whether the solution matches the expected complexity

It is meant to be simple enough to inspect, modify, and extend for your own interview prep workflow.

## Features

- Fetches problem metadata from LeetCode by URL or slug.
- Creates a local folder under `typescript/<problem-slug>/`.
- Generates a TypeScript solution file using LeetCode's TypeScript starter when available.
- Runs local test cases from `cases.json`.
- Verifies correctness before checking complexity.
- Benchmarks generated inputs to estimate time complexity.
- Uses a conservative static heuristic for space complexity.

## Requirements

- Node.js 20 or newer
- npm

## Getting Started

Install dependencies:

```bash
npm install
```

Build the project:

```bash
npm run build
```

Fetch a problem:

```bash
npm run fetch -- https://leetcode.com/problems/two-sum
```

This creates:

```text
typescript/two-sum/
  benchmark.ts
  cases.json
  problem.json
  solution.ts
```

## Workflow

Write your solution in:

```text
typescript/two-sum/solution.ts
```

Run the local cases:

```bash
npm run run -- two-sum
```

Run correctness and complexity verification:

```bash
npm run verify -- two-sum
```

You can also pass a full LeetCode URL anywhere a slug is expected:

```bash
npm run run -- https://leetcode.com/problems/two-sum
```

## Generated Files

Each fetched problem gets its own folder with these files:

| File | Purpose |
| --- | --- |
| `solution.ts` | Your exported TypeScript solution. |
| `cases.json` | Local test cases used by `npm run run` and `npm run verify`. |
| `problem.json` | Problem metadata, function name, URL, and expected complexity profile. |
| `benchmark.ts` | Input generator used for complexity benchmarking. |

## Test Case Format

`cases.json` contains an array of test cases:

```json
[
  {
    "name": "example 1",
    "input": [[2, 7, 11, 15], 9],
    "expected": [0, 1]
  }
]
```

The `input` array is spread into the exported solution function. For example, this case calls:

```ts
twoSum([2, 7, 11, 15], 9);
```

## Complexity Verification

LeetCode does not expose official editorial complexity through its public problem endpoint, so this project stores the expected profile in `problem.json`.

Example:

```json
{
  "expectedComplexity": {
    "time": "O(n)",
    "space": "O(n)",
    "source": "Common hash-map solution. Edit this if you intentionally target another profile."
  }
}
```

`npm run verify` checks:

- correctness against `cases.json`
- measured runtime growth using `benchmark.ts`
- space complexity using a simple static heuristic over `solution.ts`

The complexity check is intentionally lightweight. Treat it as a useful local signal, not a formal proof.

## Adding Support For More Problems

Most problems can be fetched immediately:

```bash
npm run fetch -- valid-palindrome
```

For problems other than `two-sum`, you will usually need to edit:

- `cases.json` with real examples and edge cases
- `benchmark.ts` with a valid `generateCase(n)` implementation
- `problem.json` with the complexity profile you are targeting

## Available Scripts

| Script | Description |
| --- | --- |
| `npm run build` | Compiles TypeScript into `dist/`. |
| `npm run fetch -- <url-or-slug>` | Fetches a LeetCode problem and creates local files. |
| `npm run run -- <slug>` | Runs local cases for a problem. |
| `npm run verify -- <slug>` | Runs cases, benchmarks time growth, and checks space complexity. |
| `npm run typecheck` | Runs TypeScript without emitting files. |

## Project Structure

```text
.
├── src/
│   └── cli.ts
├── typescript/
│   └── two-sum/
│       ├── benchmark.ts
│       ├── cases.json
│       ├── problem.json
│       └── solution.ts
├── package.json
└── tsconfig.json
```

## Notes

- The fetch command depends on LeetCode's GraphQL endpoint being available.
- Generated solution files must export the function name listed in `problem.json`.
- `two-sum` has special answer comparison because either index order is accepted.
- Complexity inference can vary on very small or very fast inputs. Increase benchmark sizes if the signal is noisy.

## Contributing

This repo is intentionally small. Good improvements include:

- better benchmark templates for common problem patterns
- more robust complexity classification
- support for more LeetCode answer comparison rules
- clearer generated starter files
- additional examples under `typescript/`

Open an issue or PR with the problem you are solving and the behavior you expect.

# LeetCode TypeScript Lab

Fetch a LeetCode problem, write your solution in `typescript/<problem-slug>/solution.ts`, run local cases, and compare measured complexity growth against an expected profile.

## Setup

```bash
nvm use 20
npm install
```

## Workflow

```bash
npm run fetch -- https://leetcode.com/problems/two-sum
npm run run -- two-sum
npm run verify -- two-sum
```

Your solution lives here:

```text
typescript/two-sum/solution.ts
```

Each problem folder contains:

- `problem.json` - fetched LeetCode metadata plus expected complexity.
- `solution.ts` - your TypeScript solution.
- `cases.json` - local test cases. Edit or add cases here.
- `benchmark.ts` - input generator used by `npm run verify`.

## Complexity Verification

LeetCode does not provide an official API for the complexity of its editorial solution. This project therefore uses an editable expected profile in `problem.json`.

`verify` checks:

- Correctness against `cases.json`.
- Time complexity by benchmarking generated inputs at increasing sizes.
- Space complexity with a conservative static heuristic over `solution.ts`.

For custom problems, edit `problem.json` and `benchmark.ts` so the verifier can compare against the complexity you expect.

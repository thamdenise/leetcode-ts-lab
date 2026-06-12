import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {isDeepStrictEqual} from 'node:util';

type Complexity = 'O(1)' | 'O(log n)' | 'O(n)' | 'O(n log n)' | 'O(n^2)' | 'unknown';

interface LeetCodeProblem {
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  content: string;
  difficulty: string;
  codeSnippets: Array<{langSlug: string; code: string}>;
  exampleTestcases: string;
  metaData: string;
}

interface ProblemFile {
  id: string;
  title: string;
  slug: string;
  difficulty: string;
  url: string;
  functionName: string;
  expectedComplexity: {
    time: Complexity;
    space: Complexity;
    source: string;
  };
}

interface TestCase {
  name: string;
  input: unknown[];
  expected: unknown;
}

interface BenchmarkModule {
  generateCase: (n: number) => unknown[];
  sizes?: number[];
}

const root = resolve('.');
const typeScriptRoot = join(root, 'typescript');

async function main(): Promise<void> {
  const [command, target] = process.argv.slice(2);

  if (!command || !['fetch', 'run', 'verify'].includes(command)) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (!target) {
    throw new Error(`Missing problem URL or slug for "${command}".`);
  }

  if (command === 'fetch') {
    await fetchCommand(target);
    return;
  }

  if (command === 'run') {
    await runCommand(slugFromInput(target));
    return;
  }

  await verifyCommand(slugFromInput(target));
}

function printHelp(): void {
  console.log(`Usage:
  npm run fetch -- https://leetcode.com/problems/two-sum
  npm run run -- two-sum
  npm run verify -- two-sum`);
}

async function fetchCommand(input: string): Promise<void> {
  const slug = slugFromInput(input);
  const problem = await fetchProblem(slug);
  const problemDir = join(typeScriptRoot, problem.titleSlug);

  await mkdir(problemDir, {recursive: true});

  const functionName = getFunctionName(problem);
  const problemFile: ProblemFile = {
    id: problem.questionFrontendId,
    title: problem.title,
    slug: problem.titleSlug,
    difficulty: problem.difficulty,
    url: `https://leetcode.com/problems/${problem.titleSlug}`,
    functionName,
    expectedComplexity: expectedComplexityFor(problem.titleSlug),
  };

  await writeFile(
    join(problemDir, 'problem.json'),
    `${JSON.stringify(problemFile, null, 2)}\n`,
  );

  const solutionPath = join(problemDir, 'solution.ts');
  if (!existsSync(solutionPath)) {
    await writeFile(solutionPath, solutionTemplate(problem, functionName));
  }

  const casesPath = join(problemDir, 'cases.json');
  if (!existsSync(casesPath)) {
    await writeFile(
      casesPath,
      `${JSON.stringify(defaultCasesFor(problem.titleSlug), null, 2)}\n`,
    );
  }

  const benchmarkPath = join(problemDir, 'benchmark.ts');
  if (!existsSync(benchmarkPath)) {
    await writeFile(benchmarkPath, benchmarkTemplate(problem.titleSlug));
  }

  console.log(`Fetched [${problem.questionFrontendId}] ${problem.title}`);
  console.log(`Solution: ${relativePath(solutionPath)}`);
  console.log(`Run: npm run run -- ${problem.titleSlug}`);
  console.log(`Verify: npm run verify -- ${problem.titleSlug}`);
}

async function runCommand(slug: string): Promise<void> {
  const {problem, cases, solve} = await loadProblem(slug);
  const results = await runCases(problem, cases, solve);

  for (const result of results) {
    console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}`);
    if (!result.pass) {
      console.log(`  expected: ${JSON.stringify(result.expected)}`);
      console.log(`  received: ${JSON.stringify(result.received)}`);
    }
  }

  if (results.some(result => !result.pass)) {
    throw new Error('At least one case failed.');
  }

  console.log(`All ${results.length} case(s) passed.`);
}

async function verifyCommand(slug: string): Promise<void> {
  const {problem, cases, solve, problemDir} = await loadProblem(slug);
  const caseResults = await runCases(problem, cases, solve);

  if (caseResults.some(result => !result.pass)) {
    for (const result of caseResults.filter(result => !result.pass)) {
      console.log(`FAIL ${result.name}`);
      console.log(`  expected: ${JSON.stringify(result.expected)}`);
      console.log(`  received: ${JSON.stringify(result.received)}`);
    }
    throw new Error('Correctness failed; complexity check skipped.');
  }

  const benchmark = await loadBenchmark(problemDir);
  const measuredTime = await inferTimeComplexity(solve, benchmark);
  const measuredSpace = await inferSpaceComplexity(join(problemDir, 'solution.ts'));

  console.log(`Correctness: PASS (${caseResults.length} case(s))`);
  console.log(
    `Time: expected ${problem.expectedComplexity.time}, measured ${measuredTime.complexity}`,
  );
  console.log(
    `Space: expected ${problem.expectedComplexity.space}, heuristic ${measuredSpace}`,
  );
  console.log('Benchmark samples:');
  for (const sample of measuredTime.samples) {
    console.log(`  n=${sample.n}: ${sample.ms.toFixed(3)}ms`);
  }

  const timePass = measuredTime.complexity === problem.expectedComplexity.time;
  const spacePass =
    measuredSpace === problem.expectedComplexity.space || measuredSpace === 'unknown';

  if (!timePass || !spacePass) {
    throw new Error('Complexity profile does not match expected complexity.');
  }

  console.log('Complexity: PASS');
}

async function fetchProblem(titleSlug: string): Promise<LeetCodeProblem> {
  const query = `
query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId
    title
    titleSlug
    content
    difficulty
    codeSnippets { langSlug code }
    exampleTestcases
    metaData
  }
}`;

  const response = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      operationName: 'questionData',
      variables: {titleSlug},
      query,
    }),
  });

  if (!response.ok) {
    throw new Error(`LeetCode request failed: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as {data?: {question?: LeetCodeProblem}};
  if (!json.data?.question) {
    throw new Error(`Problem not found: ${titleSlug}`);
  }

  return json.data.question;
}

function slugFromInput(input: string): string {
  const trimmed = input.trim().replace(/\/$/, '');
  const match = trimmed.match(/leetcode\.com\/problems\/([^/?#]+)/);
  return (match?.[1] ?? trimmed).toLowerCase();
}

function getFunctionName(problem: LeetCodeProblem): string {
  try {
    const metadata = JSON.parse(problem.metaData) as {name?: string};
    if (metadata.name) return metadata.name;
  } catch {
    // Fall back to snippet parsing below.
  }

  const snippet = problem.codeSnippets.find(item => item.langSlug === 'typescript');
  const match = snippet?.code.match(/function\s+([a-zA-Z0-9_]+)/);
  return match?.[1] ?? camelCase(problem.title);
}

function solutionTemplate(problem: LeetCodeProblem, functionName: string): string {
  const snippet = problem.codeSnippets.find(item => item.langSlug === 'typescript');
  const defaultCode =
    snippet?.code.replace(/^function\s+/, 'export function ') ??
    `export function ${functionName}(...args: unknown[]): unknown {\n  return args;\n}\n`;

  return `/*\n[${problem.questionFrontendId}] ${problem.title}\nDifficulty: ${problem.difficulty}\nURL: https://leetcode.com/problems/${problem.titleSlug}\n*/\n\n${defaultCode.trim()}\n`;
}

function benchmarkTemplate(slug: string): string {
  if (slug === 'two-sum') {
    return `export const sizes = [1000, 2000, 4000, 8000, 16000];\n\nexport function generateCase(n: number): [number[], number] {\n  const nums = Array.from({length: n}, (_, index) => index + 1);\n  nums[n - 2] = 123456789;\n  nums[n - 1] = 987654321;\n  return [nums, 1111111110];\n}\n`;
  }

  return `export const sizes = [1000, 2000, 4000, 8000];\n\nexport function generateCase(n: number): unknown[] {\n  throw new Error('Add a benchmark input generator for this problem. n=' + n);\n}\n`;
}

function defaultCasesFor(slug: string): TestCase[] {
  if (slug === 'two-sum') {
    return [
      {name: 'example 1', input: [[2, 7, 11, 15], 9], expected: [0, 1]},
      {name: 'example 2', input: [[3, 2, 4], 6], expected: [1, 2]},
      {name: 'example 3', input: [[3, 3], 6], expected: [0, 1]},
    ];
  }

  return [{name: 'add cases', input: [], expected: null}];
}

function expectedComplexityFor(slug: string): ProblemFile['expectedComplexity'] {
  if (slug === 'two-sum') {
    return {
      time: 'O(n)',
      space: 'O(n)',
      source: 'Common hash-map solution. Edit this if you intentionally target another profile.',
    };
  }

  return {
    time: 'unknown',
    space: 'unknown',
    source: 'LeetCode does not expose official solution complexity through its public GraphQL problem endpoint.',
  };
}

async function loadProblem(slug: string): Promise<{
  problem: ProblemFile;
  cases: TestCase[];
  solve: (...args: unknown[]) => unknown;
  problemDir: string;
}> {
  const problemDir = join(typeScriptRoot, slug);
  const problemPath = join(problemDir, 'problem.json');
  const casesPath = join(problemDir, 'cases.json');

  if (!existsSync(problemPath)) {
    throw new Error(`Problem not found. Run: npm run fetch -- ${slug}`);
  }

  const problem = JSON.parse(await readFile(problemPath, 'utf-8')) as ProblemFile;
  const cases = JSON.parse(await readFile(casesPath, 'utf-8')) as TestCase[];
  const solutionUrl = pathToFileURL(
    join(root, 'dist', 'typescript', slug, 'solution.js'),
  ).href;
  const solutionModule = (await import(`${solutionUrl}?cache=${Date.now()}`)) as Record<
    string,
    unknown
  >;
  const solve = solutionModule[problem.functionName];

  if (typeof solve !== 'function') {
    throw new Error(
      `solution.ts must export function "${problem.functionName}". Check problem.json if your function has a different name.`,
    );
  }

  return {problem, cases, solve: solve as (...args: unknown[]) => unknown, problemDir};
}

async function loadBenchmark(problemDir: string): Promise<BenchmarkModule> {
  const relativeProblemDir = problemDir.replace(`${typeScriptRoot}/`, '');
  const benchmarkUrl = pathToFileURL(
    join(root, 'dist', 'typescript', relativeProblemDir, 'benchmark.js'),
  ).href;
  const benchmark = (await import(`${benchmarkUrl}?cache=${Date.now()}`)) as BenchmarkModule;

  if (typeof benchmark.generateCase !== 'function') {
    throw new Error('benchmark.ts must export generateCase(n).');
  }

  return benchmark;
}

async function runCases(
  problem: ProblemFile,
  cases: TestCase[],
  solve: (...args: unknown[]) => unknown,
): Promise<Array<{name: string; pass: boolean; expected: unknown; received: unknown}>> {
  return cases.map(testCase => {
    const received = solve(...testCase.input);
    const pass =
      problem.slug === 'two-sum'
        ? sameNumberSet(received, testCase.expected)
        : isDeepStrictEqual(received, testCase.expected);

    return {
      name: testCase.name,
      pass,
      expected: testCase.expected,
      received,
    };
  });
}

async function inferTimeComplexity(
  solve: (...args: unknown[]) => unknown,
  benchmark: BenchmarkModule,
): Promise<{complexity: Complexity; samples: Array<{n: number; ms: number}>}> {
  const sizes = benchmark.sizes ?? [1000, 2000, 4000, 8000];
  const samples = [];

  for (const n of sizes) {
    const times = [];
    for (let i = 0; i < 7; i++) {
      const args = benchmark.generateCase(n);
      const started = performance.now();
      solve(...args);
      times.push(performance.now() - started);
    }
    times.sort((a, b) => a - b);
    samples.push({n, ms: times[Math.floor(times.length / 2)]});
  }

  return {complexity: classifyTime(samples), samples};
}

function classifyTime(samples: Array<{n: number; ms: number}>): Complexity {
  const usable = samples.filter(sample => sample.ms > 0.001);
  if (usable.length < 3) return 'unknown';

  const first = usable[0];
  const last = usable[usable.length - 1];
  const growth = last.ms / first.ms;
  const nGrowth = last.n / first.n;
  const slope = Math.log(growth) / Math.log(nGrowth);

  if (slope < 0.25) return 'O(1)';
  if (slope < 0.6) return 'O(log n)';
  if (slope < 1.25) return 'O(n)';
  if (slope < 1.65) return 'O(n log n)';
  return 'O(n^2)';
}

async function inferSpaceComplexity(solutionPath: string): Promise<Complexity> {
  const source = await readFile(solutionPath, 'utf-8');

  if (/\bnew\s+(Map|Set)\b|Array\.from|new\s+Array|\[\]/.test(source)) {
    return 'O(n)';
  }

  return 'O(1)';
}

function sameNumberSet(received: unknown, expected: unknown): boolean {
  if (!Array.isArray(received) || !Array.isArray(expected)) return false;
  if (received.length !== expected.length) return false;
  return [...received].sort().every((value, index) => value === [...expected].sort()[index]);
}

function camelCase(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`,
    )
    .join('');
}

function relativePath(path: string): string {
  return path.replace(`${root}/`, '');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

export const sizes = [1000, 2000, 4000, 8000, 16000];

export function generateCase(n: number): [number[], number] {
  const nums = Array.from({length: n}, (_, index) => index + 1);
  nums[n - 2] = 123456789;
  nums[n - 1] = 987654321;
  return [nums, 1111111110];
}

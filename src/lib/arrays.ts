/**
 * The element at `index`, or undefined outside the array (negative, past the end, NaN), unlike
 * `array[index]`, which TypeScript assumes is always there.
 */
export function itemAt<T>(array: readonly T[], index: number): T | undefined {
  return Number.isInteger(index) && index >= 0 && index < array.length ? array.at(index) : undefined;
}

export function parseRate(rate?: string): number | undefined {
  if (!rate || rate === "0/0") return undefined;
  const [num, den] = rate.split("/").map(Number);
  if (!Number.isFinite(num)) return undefined;
  if (!den) return num;
  return Math.round((num / den) * 100) / 100;
}

export function parseNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Parses duration strings for JWT/cookie TTL config.
 * Supports `30d`, `12h`, `15m`, `90s`, or a plain number (seconds).
 */
export function parseDurationToSeconds(value: string): number | undefined {
  const trimmed = value.trim();
  const num = Number(trimmed);
  if (Number.isFinite(num) && num > 0 && !/[a-z]/i.test(trimmed)) {
    return num;
  }
  const m = /^(\d+)\s*([dhms])$/i.exec(trimmed);
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const mult =
    unit === 'd'
      ? 86400
      : unit === 'h'
        ? 3600
        : unit === 'm'
          ? 60
          : 1;
  return n * mult;
}

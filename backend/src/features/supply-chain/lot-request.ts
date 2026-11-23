import { createHash } from 'crypto';

/** Stable request identity: field order must not change retry semantics. */
export function lotRequestFingerprint(request: object): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(
            ([key, item]) => key !== 'idempotencyKey' && item !== undefined,
          )
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      );
    }
    return typeof value === 'string' ? value.trim() : value;
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical(request)))
    .digest('hex');
}

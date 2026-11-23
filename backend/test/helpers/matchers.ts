// Jest's asymmetric matchers are typed as `any`; expose them as unknown so
// composing nested expected payloads does not erase the surrounding types.
export function objectContaining(value: Record<string, unknown>): unknown {
  return expect.objectContaining(value) as unknown;
}

export function anyValue(value: unknown): unknown {
  return expect.any(value) as unknown;
}

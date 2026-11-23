import axios from 'axios';

/** Extract only displayable messages from failed requests, including validation arrays. */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ message?: unknown; error?: { message?: unknown; details?: unknown } }>(error)) {
    const payload = error.response?.data;
    for (const candidate of [payload?.error?.details, payload?.error?.message, payload?.message]) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate;
      if (Array.isArray(candidate)) {
        const messages = candidate.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
        if (messages.length) return messages.join('. ');
      }
    }
    return fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

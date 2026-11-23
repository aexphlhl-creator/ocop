/** Escape text before placing API data into a non-React HTML template (e.g. Leaflet). */
export function escapeHtml(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

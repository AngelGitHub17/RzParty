/** Journal console horodaté, en français. */
export function log(...parts: unknown[]): void {
  const time = new Date().toLocaleTimeString("fr-FR", { hour12: false });
  console.log(`[${time}]`, ...parts);
}

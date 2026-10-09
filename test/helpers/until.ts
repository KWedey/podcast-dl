/**
 * Wait until `condition` holds, yielding to the event loop between checks.
 * It uses no timers, so it keeps working while a test fakes them.
 */
export async function until(condition: () => boolean): Promise<void> {
  while (!condition()) await new Promise<void>((resolve) => setImmediate(resolve));
}

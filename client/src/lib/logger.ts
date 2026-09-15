// Do not log source records, request bodies, or credentials in the browser.
export const logger = { error(message: string, _error?: unknown) { console.error(message); } };

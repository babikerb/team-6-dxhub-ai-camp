// Mock API layer for the Intake Form (Person 1).
// Swap this out for a real `fetch("/requests", { method: "POST", ... })`
// once Person 3's endpoint is live. Response shape must stay { request_id }.

const MOCK_DELAY_MS = 700;

export function createRequest(_requestor) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ request_id: crypto.randomUUID() });
    }, MOCK_DELAY_MS);
  });
}

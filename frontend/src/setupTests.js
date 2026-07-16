import '@testing-library/jest-dom';

// jsdom has no layout engine, so it never implemented matchMedia — polyfill
// it as "no query ever matches" so useIsMobile()-style hooks default to the
// desktop layout in tests instead of throwing.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

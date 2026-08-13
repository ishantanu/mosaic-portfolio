/**
 * Single shared React instance.
 * ALL files must import React and html from here.
 * This prevents multiple-React-instance errors (React error #31).
 */
export {
  createElement,
  Fragment,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'https://esm.sh/react@18.3.1';

export { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';

// Bind htm to THIS React.createElement — not htm's own bundled React copy
import _htm from 'https://esm.sh/htm@3.1.1';
import { createElement as _h } from 'https://esm.sh/react@18.3.1';
export const html = _htm.bind(_h);

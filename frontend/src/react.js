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
} from 'react';

export { createRoot } from 'react-dom/client';

// Bind htm to THIS React.createElement — not htm's own bundled React copy
import _htm from 'htm';
import { createElement as _h } from 'react';
// htm templates use HTML spelling; React's development build expects DOM props.
const domProps = {
  class: 'className', for: 'htmlFor', colspan: 'colSpan', rowspan: 'rowSpan',
  autocomplete: 'autoComplete', tabindex: 'tabIndex',
  'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin', 'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset', 'text-anchor': 'textAnchor',
  'fill-rule': 'fillRule', 'clip-rule': 'clipRule',
};
export const html = _htm.bind((type, props, ...children) => {
  const normalized = props && Object.fromEntries(Object.entries(props).map(
    ([key, value]) => [domProps[key] || key, value],
  ));
  return _h(type, normalized, ...children);
});

// Bridge the existing htm views to the locally owned shadcn components.
import { createElement } from 'react';
import { Button as BaseButton } from './button.jsx';
import { Card as BaseCard } from './card.jsx';
import { Input as BaseInput } from './input.jsx';
import { Table as BaseTable } from './table.jsx';
import { cn } from '../../lib/utils.js';

function bridge(Component, defaults = {}) {
  return function ComponentBridge({ class: legacyClass, className, ...props }) {
    return createElement(Component, { ...defaults, ...props, className: cn(legacyClass, className) });
  };
}
export const Button = bridge(BaseButton, { variant: 'outline', type: 'button' });
export const Card = bridge(BaseCard);
export const Input = bridge(BaseInput);
export const Table = bridge(BaseTable);

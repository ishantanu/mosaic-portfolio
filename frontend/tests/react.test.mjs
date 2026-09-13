import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { html } from '../src/react.js';

test('htm normalizes HTML attributes for bundled React', () => {
  const element = html`<label class="field" for="name">Name</label>`;
  assert.equal(element.props.className, 'field');
  assert.equal(element.props.htmlFor, 'name');
  assert.equal(renderToStaticMarkup(element), '<label class="field" for="name">Name</label>');
});

test('htm normalizes SVG attributes without changing accessible labels', () => {
  const element = html`<svg stroke-width="2" aria-label="Chart" />`;
  assert.equal(element.props.strokeWidth, '2');
  assert.equal(element.props['aria-label'], 'Chart');
});

test('component props and callbacks survive the htm bridge', () => {
  const onClick = () => {};
  const Component = () => null;
  const element = html`<${Component} class="control" onClick=${onClick} disabled=${true} />`;
  assert.equal(element.type, Component);
  assert.equal(element.props.className, 'control');
  assert.equal(element.props.onClick, onClick);
  assert.equal(element.props.disabled, true);
});

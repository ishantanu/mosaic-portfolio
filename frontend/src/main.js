import { createElement, createRoot } from './react.js';
import './observability.js';
import App from './App.js';

const root = createRoot(document.getElementById('root'));
root.render(createElement(App));

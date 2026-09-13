import { createElement, createRoot } from './react.js';
import './observability.js';
import App from './App.js';
import './ui.css';
import './styles.css';
import './refresh.css';

const root = createRoot(document.getElementById('root'));
root.render(createElement(App));

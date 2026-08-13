import { html } from '../react.js';

export default function NotFoundView() {
  return html`
    <div class="not-found">
      <div class="not-found-code">404</div>
      <div class="not-found-msg">Page not found</div>
      <p style=${{ marginTop: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
        The page you're looking for doesn't exist.
        <a href="#dashboard" style=${{ color: 'var(--hl-teal)', textDecoration: 'none', marginLeft: '4px' }}>
          Go to Dashboard →
        </a>
      </p>
    </div>`;
}

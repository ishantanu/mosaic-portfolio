# Mosaic web client

The web client is a Vite-built React application that can run independently
from the Go API during development. It uses the API at
`http://localhost:8081` by default.

Install dependencies and start the local development server:

```bash
npm ci
npm run dev
```

The browser app runs at `http://localhost:5173`. Set
`window.__MOSAIC_API_URL__` in `index.html` before `main.js` when the API
is hosted elsewhere. Run `npm run build` to produce the deployable static
assets in `dist/`.

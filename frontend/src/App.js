import { useState, useEffect, useCallback } from './react.js';
import { html } from './react.js';
import { useApi } from './useApi.js';
import { endpoints } from './api.js';

import Sidebar    from './components/Sidebar.js';
import TopBar     from './components/TopBar.js';
import { AddBrokerModal } from './components/AddBrokerModal.js';

import DashboardView      from './views/DashboardView.js';
import AccountSummaryView from './views/AccountSummaryView.js';
import PositionsView      from './views/PositionsView.js';
import OrdersView         from './views/OrdersView.js';
import DividendsView      from './views/DividendsView.js';
import SettingsView       from './views/SettingsView.js';
import NotFoundView       from './views/NotFoundView.js';

// ── Route registry ────────────────────────────────────────────────────────────
const ROUTES = {
  '#dashboard': { label: 'Dashboard',       component: DashboardView,      needsData: true  },
  '#summary':   { label: 'Account Summary', component: AccountSummaryView, needsData: true  },
  '#positions': { label: 'Positions',       component: PositionsView,      needsData: true  },
  '#orders':    { label: 'Orders',          component: OrdersView,         needsData: true  },
  '#dividends': { label: 'Dividends',       component: DividendsView,      needsData: true  },
  '#settings':  { label: 'Settings',        component: SettingsView,       needsData: false },
};

function getHash() {
  const h = window.location.hash || '#dashboard';
  return ROUTES[h] ? h : '#dashboard';
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [hash,          setHash]          = useState(getHash);
  const [valuesVisible, setValuesVisible] = useState(true);
  const [refreshKey,    setRefreshKey]    = useState(0);
  const [refreshing,    setRefreshing]    = useState(false);
  const [lastUpdated,   setLastUpdated]   = useState(null);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [darkTheme, setDarkTheme] = useState(() => window.localStorage.getItem('mosaic-theme') === 'dark');
  const [brokerModalOpen, setBrokerModalOpen] = useState(false);
  const { data: accountSummary } = useApi(endpoints.accountSummary, refreshKey);

  useEffect(() => { window.localStorage.setItem('mosaic-theme', darkTheme ? 'dark' : 'light'); }, [darkTheme]);

  // ── Hash-based routing ──────────────────────────────────────────────────────
  useEffect(() => {
    const onHashChange = () => setHash(getHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // ── Refresh handler ─────────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey(k => k + 1);
    // Give a brief visual spinner, then clear
    setTimeout(() => {
      setRefreshing(false);
      setLastUpdated(new Date());
    }, 600);
  }, []);

  // Set lastUpdated on first load
  useEffect(() => {
    setLastUpdated(new Date());
  }, []);

  // ── Toggle values visibility ────────────────────────────────────────────────
  const handleToggleValues = useCallback(() => {
    setValuesVisible(v => !v);
  }, []);

  // ── Render active view ──────────────────────────────────────────────────────
  const route = ROUTES[hash] ?? ROUTES['#dashboard'];
  const ViewComponent = route.component;
  const currentPage = route.label;

  return html`
    <div class=${'app-shell' + (darkTheme ? ' theme-dark' : '')}>
      <${Sidebar} currentHash=${hash} open=${navigationOpen} onClose=${() => setNavigationOpen(false)} summary=${accountSummary} />
      ${navigationOpen ? html`<button class="mobile-nav-backdrop" type="button" aria-label="Close navigation menu" onClick=${() => setNavigationOpen(false)}></button>` : null}

      <${TopBar}
        currentPage=${currentPage}
        valuesVisible=${valuesVisible}
        onToggleValues=${handleToggleValues}
        onRefresh=${handleRefresh}
        refreshing=${refreshing}
        lastUpdated=${lastUpdated}
        onMenuToggle=${() => setNavigationOpen(open => !open)}
        darkTheme=${darkTheme}
        onToggleTheme=${() => setDarkTheme(current => !current)}
        onAddBroker=${() => setBrokerModalOpen(true)}
      />

      <main class="main-content">
        <${ViewComponent}
          visible=${valuesVisible}
          refreshKey=${refreshKey}
          onToggleValues=${handleToggleValues}
        />
      </main>
      ${brokerModalOpen ? html`<${AddBrokerModal} onClose=${() => setBrokerModalOpen(false)} />` : null}
    </div>`;
}

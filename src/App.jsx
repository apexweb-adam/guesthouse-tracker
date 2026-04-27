import React from 'react';
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { AppProvider } from './context/AppContext.jsx';
import { useApp } from './context/AppContext.jsx';
import { enableDemoModeOverride } from './lib/api.js';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import Notification from './components/Notification.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ApprovalQueue from './pages/ApprovalQueue.jsx';
import Discovered from './pages/Discovered.jsx';
import DiscoveryProfile from './pages/DiscoveryProfile.jsx';
import Tracker from './pages/Tracker.jsx';
import OpportunityDetail from './pages/OpportunityDetail.jsx';
import ApplyPack from './pages/ApplyPack.jsx';
import Sources from './pages/Sources.jsx';
import Import from './pages/Import.jsx';
import Reports from './pages/Reports.jsx';
import QuickAdd from './pages/QuickAdd.jsx';
import './App.css';

// ── Error Boundary ─────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', maxWidth: 600, margin: '0 auto' }}>
          <h1 style={{ color: '#c81e1e', fontSize: 20, marginBottom: 12 }}>⚠️ Something went wrong</h1>
          <p style={{ color: '#374151', marginBottom: 16 }}>
            The application encountered an unexpected error. If this persists, try clearing your browser's local storage.
          </p>
          <pre style={{ background: '#f3f4f6', padding: 16, borderRadius: 8, fontSize: 12, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            style={{ marginTop: 16, padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Clear data & reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Backend Error Banner ────────────────────────────────────────────────────
// Shown when production-mode API calls fail (Supabase unreachable, 502, etc.)
// Gives the user a one-click escape to demo mode so the app is still usable.

function BackendErrorBanner() {
  const { state } = useApp();
  if (!state.error || state.demoMode) return null;
  return (
    <div
      role="alert"
      style={{
        background: '#fff7ed', borderBottom: '1px solid #fed7aa',
        padding: '10px 24px', fontSize: 13, color: '#9a3412',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}
    >
      <span aria-label="Warning"><span aria-hidden="true">⚠️ </span><strong>Backend unavailable:</strong> {state.error}.</span>
      <button
        style={{
          background: '#fff', border: '1px solid #fed7aa', borderRadius: 6,
          padding: '3px 10px', fontSize: 12, color: '#9a3412', cursor: 'pointer',
          fontWeight: 600,
        }}
        onClick={() => { enableDemoModeOverride(); window.location.reload(); }}
      >
        Switch to demo mode
      </button>
    </div>
  );
}

// ── App Shell layout (rendered inside the router) ──────────────────────────
function AppContent() {
  return (
    <div className="layout">
      <Header />
      <BackendErrorBanner />
      <div className="main-content">
        <Sidebar />
        <main className="page-area">
          <Outlet />
        </main>
      </div>
      <Notification />
    </div>
  );
}

function AppShell() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

// ── Router ─────────────────────────────────────────────────────────────────
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: (
      <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ color: '#c81e1e' }}>Page not found</h1>
        <a href="/" style={{ color: '#1e3a5f' }}>← Back to Dashboard</a>
      </div>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'queue', element: <ApprovalQueue /> },
      { path: 'discover', element: <Discovered /> },
      { path: 'discover/profile', element: <DiscoveryProfile /> },
      { path: 'tracker', element: <Tracker /> },
      { path: 'opportunity/:id', element: <OpportunityDetail /> },
      { path: 'apply-pack/:id', element: <ApplyPack /> },
      { path: 'sources', element: <Sources /> },
      { path: 'import', element: <Import /> },
      { path: 'quick-add', element: <QuickAdd /> },
      { path: 'reports', element: <Reports /> },
    ],
  },
]);

export default function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}

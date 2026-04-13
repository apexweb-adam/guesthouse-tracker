import React from 'react';
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { AppProvider } from './context/AppContext.jsx';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import Notification from './components/Notification.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ApprovalQueue from './pages/ApprovalQueue.jsx';
import Tracker from './pages/Tracker.jsx';
import OpportunityDetail from './pages/OpportunityDetail.jsx';
import Sources from './pages/Sources.jsx';
import Import from './pages/Import.jsx';
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
            The application encountered an unexpected error. If this persists, try clearing your browser&apos;s local storage.
          </p>
          <pre style={{ background: '#f3f4f6', padding: 16, borderRadius: 8, fontSize: 12, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            style={{ marginTop: 16, padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Clear data &amp; reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── App Shell layout (rendered inside the router) ──────────────────────────
function AppShell() {
  return (
    <AppProvider>
      <div className="layout">
        <Header />
        <div className="main-content">
          <Sidebar />
          <main className="page-area">
            <Outlet />
          </main>
        </div>
        <Notification />
      </div>
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
      { path: 'tracker', element: <Tracker /> },
      { path: 'opportunity/:id', element: <OpportunityDetail /> },
      { path: 'sources', element: <Sources /> },
      { path: 'import', element: <Import /> },
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

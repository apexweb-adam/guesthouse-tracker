import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

function AppShell() {
  return (
    <div className="layout">
      <Header />
      <div className="main-content">
        <Sidebar />
        <main className="page-area">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/queue" element={<ApprovalQueue />} />
            <Route path="/tracker" element={<Tracker />} />
            <Route path="/opportunity/:id" element={<OpportunityDetail />} />
            <Route path="/sources" element={<Sources />} />
            <Route path="/import" element={<Import />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <Notification />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </BrowserRouter>
  );
}

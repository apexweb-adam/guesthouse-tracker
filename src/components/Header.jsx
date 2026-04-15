import React from 'react';
import { useApp } from '../context/AppContext.jsx';

export default function Header() {
  const { state } = useApp();
  return (
    <header className="app-header">
      <div className="app-header__logo">
        🔍 Job Search <span>OS</span>
      </div>
      <div className="app-header__right">
        {state.demoMode && <span className="demo-badge">DEMO MODE</span>}
        <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>Sample Candidate</span>
      </div>
    </header>
  );
}

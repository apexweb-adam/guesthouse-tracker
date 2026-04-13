import React from 'react';
import { useApp } from '../context/AppContext.jsx';

export default function Notification() {
  const { state } = useApp();
  if (!state.notification) return null;
  const { message, type } = state.notification;
  return (
    <div className="toast-container">
      <div className={`toast toast-${type || 'info'}`}>{message}</div>
    </div>
  );
}

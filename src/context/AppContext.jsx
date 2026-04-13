import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { fetchOpportunities, fetchSources, fetchLogs, isDemoMode } from '../lib/api.js';

const AppContext = createContext(null);

function getInitial() {
  return {
    opportunities: [],
    sources: [],
    logs: [],
    loading: false,
    error: null,
    notification: null,
    demoMode: isDemoMode(),
    liveIntakeEnabled: false,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING': return { ...state, loading: action.payload };
    case 'SET_ERROR': return { ...state, error: action.payload, loading: false };
    case 'SET_OPPORTUNITIES': return { ...state, opportunities: action.payload, loading: false };
    case 'SET_SOURCES': return { ...state, sources: action.payload.sources, liveIntakeEnabled: action.payload.liveIntakeEnabled };
    case 'SET_LOGS': return { ...state, logs: action.payload };
    case 'UPDATE_OPPORTUNITY': return {
      ...state,
      opportunities: state.opportunities.map(o => o.id === action.payload.id ? { ...o, ...action.payload } : o),
    };
    case 'ADD_OPPORTUNITY': return { ...state, opportunities: [action.payload, ...state.opportunities] };
    case 'NOTIFY': return { ...state, notification: action.payload };
    case 'CLEAR_NOTIFY': return { ...state, notification: null };
    default: return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, getInitial);

  const loadOpportunities = useCallback(async (filters = {}) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const opps = await fetchOpportunities(filters);
      dispatch({ type: 'SET_OPPORTUNITIES', payload: opps });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    }
  }, []);

  const loadSources = useCallback(async () => {
    try {
      const data = await fetchSources();
      dispatch({ type: 'SET_SOURCES', payload: data });
    } catch (err) {
      console.error('Failed to load sources:', err);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const data = await fetchLogs();
      dispatch({ type: 'SET_LOGS', payload: data.logs || [] });
    } catch (err) {
      console.error('Failed to load logs:', err);
    }
  }, []);

  const notify = useCallback((message, type = 'info') => {
    dispatch({ type: 'NOTIFY', payload: { message, type, id: Date.now() } });
    setTimeout(() => dispatch({ type: 'CLEAR_NOTIFY' }), 4000);
  }, []);

  useEffect(() => {
    loadOpportunities();
    loadSources();
    loadLogs();
  }, [loadOpportunities, loadSources, loadLogs]);

  return (
    <AppContext.Provider value={{ state, dispatch, loadOpportunities, loadSources, loadLogs, notify }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export default AppContext;

import React from 'react';
import { useApp } from '../context/AppContext.jsx';
import { toggleSource } from '../lib/api.js';

const TRUST_COLOR = { high: 'var(--green)', medium: 'var(--amber)', low: 'var(--red)' };

export default function Sources() {
  const { state, loadSources, notify } = useApp();
  const { sources, liveIntakeEnabled, demoMode } = state;

  const handleToggle = async (src) => {
    if (src.liveCapable && !liveIntakeEnabled) {
      notify('Live intake is disabled globally. Set LIVE_INTAKE_ENABLED=true to enable live sources.', 'warning');
      return;
    }
    try {
      await toggleSource(src.id, !src.enabled);
      await loadSources();
      notify(`${src.name} ${!src.enabled ? 'enabled' : 'disabled'}.`, 'info');
    } catch (e) { notify(e.message, 'error'); }
  };

  return (
    <div>
      <h1 className="section-title">Sources</h1>
      <p className="section-sub">Source governance — control what is ingested, monitored, and trusted.</p>

      <div className="card card-pad" style={{
        marginBottom: 20,
        borderLeft: `3px solid ${liveIntakeEnabled ? 'var(--green)' : 'var(--red)'}`,
        background: liveIntakeEnabled ? 'var(--green-light)' : 'var(--red-light)',
      }}>
        <div className="flex items-center gap-2">
          <div>
            <div className="font-semibold" style={{ fontSize: 14 }}>
              Live Intake Kill Switch: {liveIntakeEnabled ? 'ON' : 'OFF'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-700)', marginTop: 2 }}>
              {liveIntakeEnabled
                ? 'Live automated sources (RSS, API) are enabled. Control individually below.'
                : 'All live automated intake is disabled. Only manual entry and CSV upload are active. Set LIVE_INTAKE_ENABLED=true to enable.'}
            </div>
          </div>
        </div>
        {demoMode && (
          <div style={{ fontSize: 11, marginTop: 8, color: 'var(--gray-600)' }}>
            Demo mode: live intake is always OFF. CSV and manual intake are fully functional.
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Source Health</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="source-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Type</th>
                <th>Trust</th>
                <th>Enabled</th>
                <th>Last Run</th>
                <th>Imported</th>
                <th>Deduped</th>
                <th>High Review</th>
                <th>Failures</th>
                <th>Toggle</th>
              </tr>
            </thead>
            <tbody>
              {(sources || []).map(src => (
                <tr key={src.id}>
                  <td>
                    <div className="font-medium">{src.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', maxWidth: 280, whiteSpace: 'normal' }}>{src.description}</div>
                    {src.noisy_warning && (
                      <div style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600, marginTop: 2 }}>
                        ⚠ Noisy source — &gt;50% low-fit records. Review signal quality before continuing.
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>{src.type}</td>
                  <td>
                    <span style={{ color: TRUST_COLOR[src.trustLevel] || 'var(--gray-400)', fontWeight: 600, fontSize: 12 }}>
                      {src.trustLevel || 'unknown'}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: src.enabled ? 'var(--green)' : 'var(--gray-400)', fontWeight: 600, fontSize: 12 }}>
                      {src.enabled ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {src.last_run ? new Date(src.last_run).toLocaleString() : 'Never'}
                    {src.last_status && (
                      <div style={{ fontSize: 10, color: src.last_status === 'failure' ? 'var(--red)' : src.last_status === 'partial' ? 'var(--amber)' : 'var(--green)' }}>
                        {src.last_status}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>{src.total_imported || 0}</td>
                  <td style={{ fontSize: 12 }}>{src.total_deduped || 0}</td>
                  <td style={{ fontSize: 12, color: src.total_high_review > 0 ? 'var(--amber)' : 'inherit' }}>
                    {src.total_high_review || 0}
                  </td>
                  <td style={{ fontSize: 12, color: src.total_failures > 0 ? 'var(--red)' : 'inherit' }}>
                    {src.total_failures || 0}
                  </td>
                  <td>
                    {src.liveCapable ? (
                      <button
                        className={`btn btn-sm ${src.enabled ? 'btn-danger' : 'btn-success'}`}
                        onClick={() => handleToggle(src)}
                        disabled={!liveIntakeEnabled}
                      >
                        {src.enabled ? 'Disable' : 'Enable'}
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>Always on</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16, fontSize: 12, color: 'var(--gray-600)', lineHeight: 1.6 }}>
        <strong>Source governance rules:</strong> LinkedIn automation is NOT supported.
        Arbitrary scraping and browser-bot flows are NOT supported.
        Only structured RSS/Atom feeds, approved public ATS/job APIs, email alerts,
        and manual/CSV intake are allowed.
      </div>
    </div>
  );
}

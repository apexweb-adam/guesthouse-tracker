import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { importCSV, createOpportunity } from '../lib/api.js';

const SAMPLE_CSV = `title,company,location,url,description
Technical Project Manager,Acme Corp,Sydney NSW,https://example.com/job/tpm,"Lead technical delivery projects, agile scrum, stakeholder management, Jira, SDLC"
Delivery Manager,FinTech Pty Ltd,Melbourne VIC,https://example.com/job/dm,"Agile delivery lead for cross-functional squads, SAFe, sprint planning, release management"
Operations Manager,Retail Co,Brisbane QLD,,"Store operations management, staff rostering, inventory"
`;

export default function Import() {
  const { loadOpportunities, loadLogs, notify } = useApp();
  const [csvText, setCsvText] = useState('');
  const [csvResult, setCsvResult] = useState(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const fileRef = useRef();

  // Manual intake state
  const [manual, setManual] = useState({ title: '', company: '', location: '', url: '', description: '' });
  const [manualLoading, setManualLoading] = useState(false);

  const handleCSVImport = async () => {
    if (!csvText.trim()) { notify('Paste or upload CSV text first.', 'warning'); return; }
    setCsvLoading(true);
    setCsvResult(null);
    try {
      const result = await importCSV(csvText);
      setCsvResult({ success: true, ...result });
      await loadOpportunities();
      await loadLogs();
      notify(`CSV imported: ${result.summary?.new || 0} new, ${result.summary?.deduped || 0} deduped.`, 'success');
    } catch (e) {
      setCsvResult({ success: false, error: e.message });
      notify(e.message, 'error');
    } finally { setCsvLoading(false); }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file);
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manual.title) { notify('Title is required.', 'warning'); return; }
    setManualLoading(true);
    try {
      const result = await createOpportunity(manual);
      if (result.duplicate) {
        notify('This opportunity already exists (deduplicated).', 'warning');
      } else {
        await loadOpportunities();
        await loadLogs();
        setManual({ title: '', company: '', location: '', url: '', description: '' });
        notify('Opportunity added successfully.', 'success');
      }
    } catch (e) { notify(e.message, 'error'); }
    finally { setManualLoading(false); }
  };

  return (
    <div>
      <h1 className="section-title">Import / Intake</h1>
      <p className="section-sub">Add opportunities via CSV upload, paste, or manual entry. All items go through scoring and deduplication automatically.</p>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* CSV Import */}
        <div className="card">
          <div className="card-header">
            <h2>CSV Import</h2>
          </div>
          <div className="card-body">
            <div className="import-zone" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 8 }}>
                Drag-and-drop or upload a CSV file
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current.click()}>
                Choose CSV file
              </button>
            </div>

            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Or paste CSV text</label>
              <textarea
                className="form-textarea w-full"
                rows={6}
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={SAMPLE_CSV}
                style={{ fontFamily: 'monospace', fontSize: 11 }}
              />
            </div>

            <div className="flex gap-2" style={{ marginBottom: 8 }}>
              <button className="btn btn-primary" onClick={handleCSVImport} disabled={csvLoading}>
                {csvLoading ? 'Importing...' : 'Import CSV'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setCsvText(SAMPLE_CSV); setCsvResult(null); }}>
                Load sample
              </button>
            </div>

            {csvResult && (
              <div className={`import-result ${csvResult.success ? '' : 'import-result-error'}`}>
                {csvResult.success ? (
                  <div style={{ fontSize: 13 }}>
                    <div className="font-semibold" style={{ marginBottom: 4 }}>Import complete</div>
                    <div>Rows parsed: {csvResult.summary?.rows_parsed || csvResult.summary?.valid_jobs}</div>
                    <div>New opportunities: <strong>{csvResult.summary?.new}</strong></div>
                    <div>Deduplicated: {csvResult.summary?.deduped}</div>
                    {csvResult.summary?.errors > 0 && <div style={{ color: 'var(--amber)' }}>Errors: {csvResult.summary.errors}</div>}
                    {(csvResult.inserted || []).slice(0, 3).map(o => (
                      <div key={o.id} style={{ fontSize: 12, marginTop: 4, color: 'var(--gray-700)' }}>
                        + {o.title} — {o.company} (score: {o.fit_score})
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--red)' }}>{csvResult.error}</div>
                )}
              </div>
            )}

            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--gray-600)', lineHeight: 1.5 }}>
              <strong>Expected columns (flexible):</strong> title, company, location, url, description.
              Column names are case-insensitive.
            </div>
          </div>
        </div>

        {/* Manual Intake */}
        <div className="card">
          <div className="card-header">
            <h2>Manual Entry</h2>
          </div>
          <div className="card-body">
            <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Job Title *</label>
                <input className="form-input" value={manual.title} onChange={e => setManual(s => ({ ...s, title: e.target.value }))} placeholder="e.g. Senior Technical Project Manager" required />
              </div>
              <div className="form-group">
                <label className="form-label">Company</label>
                <input className="form-input" value={manual.company} onChange={e => setManual(s => ({ ...s, company: e.target.value }))} placeholder="e.g. ANZ Banking Group" />
              </div>
              <div className="form-group">
                <label className="form-label">Location</label>
                <input className="form-input" value={manual.location} onChange={e => setManual(s => ({ ...s, location: e.target.value }))} placeholder="e.g. Sydney, NSW (Hybrid)" />
              </div>
              <div className="form-group">
                <label className="form-label">URL</label>
                <input className="form-input" value={manual.url} onChange={e => setManual(s => ({ ...s, url: e.target.value }))} placeholder="https://..." type="url" />
              </div>
              <div className="form-group">
                <label className="form-label">Description / Notes</label>
                <textarea className="form-textarea w-full" rows={4} value={manual.description} onChange={e => setManual(s => ({ ...s, description: e.target.value }))} placeholder="Paste the job description here for accurate scoring..." />
              </div>
              <button className="btn btn-primary" type="submit" disabled={manualLoading}>
                {manualLoading ? 'Adding...' : 'Add Opportunity'}
              </button>
            </form>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--gray-600)', lineHeight: 1.5 }}>
              The description is used for scoring and classification.
              More detail = more accurate fit score.
            </div>
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ fontSize: 12, color: 'var(--gray-600)', lineHeight: 1.6 }}>
        <strong>What happens after import:</strong> Each opportunity is automatically scored (0-100), classified into the
        correct lane (TPM primary, Delivery Manager secondary, conditional Ops/Program Manager), deduplicated, and
        added to the approval queue. No application is submitted automatically.
      </div>
    </div>
  );
}

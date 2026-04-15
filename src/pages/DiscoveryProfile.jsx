import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { fetchDiscoveryProfile, saveDiscoveryProfile, fetchProfileBothSources, isDemoMode } from '../lib/api.js';

function TagInput({ label, hint, value = [], onChange }) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim().toLowerCase();
    if (v && !value.includes(v)) onChange([...value, v]);
    setText('');
  };
  const remove = (item) => onChange(value.filter(x => x !== item));
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>{hint}</div>}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        {value.map(v => (
          <span key={v} style={{
            background: '#eff6ff', color: '#1e40af', borderRadius: 9999,
            padding: '2px 10px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            {v}
            <button
              onClick={() => remove(v)}
              style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 0, fontSize: 12 }}
            >✕</button>
          </span>
        ))}
        {value.length === 0 && <span style={{ fontSize: 12, color: '#9ca3af' }}>None</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Type and press Enter"
          style={{
            flex: 1, padding: '6px 10px', fontSize: 13, borderRadius: 6,
            border: '1px solid #d1d5db', outline: 'none',
          }}
        />
        <button
          onClick={add}
          style={{
            padding: '6px 12px', background: '#1e3a5f', color: '#fff',
            border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer',
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

const SOURCE_FAMILIES = ['greenhouse', 'lever', 'usajobs', 'seek', 'rss'];
const SOURCE_LABELS = {
  greenhouse: '🌱 Greenhouse',
  lever: '⚙️ Lever',
  usajobs: '🇺🇸 USAJobs',
  seek: '🔍 SEEK RSS',
  rss: '📡 RSS/Atom',
};

export default function DiscoveryProfile() {
  const { notify } = useApp();
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'server' | 'local_only' | 'local' | null
  const [conflict, setConflict] = useState(null); // { server, local } or null

  useEffect(() => {
    if (!isDemoMode()) {
      fetchProfileBothSources().then(({ server, local, hasConflict, serverSource }) => {
        if (hasConflict) {
          setConflict({ server, local });
        } else {
          // No conflict — load server if available, else local
          setProfile(server || local || null);
          if (!server && !local) {
            fetchDiscoveryProfile().then(p => setProfile(p));
          }
        }
      }).catch(() => {
        fetchDiscoveryProfile().then(p => setProfile(p));
      });
    } else {
      fetchDiscoveryProfile().then(p => setProfile(p));
    }
  }, []);

  const update = (field, value) => {
    setProfile(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const toggleSource = (family) => {
    const current = profile.enabledSourceFamilies || [];
    const next = current.includes(family)
      ? current.filter(f => f !== family)
      : [...current, family];
    update('enabledSourceFamilies', next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveDiscoveryProfile(profile);
      setSaveStatus(result.persisted || 'local');
      if (result.persisted === 'local_only') {
        notify('Profile saved locally (server unavailable — will sync when online).', 'warning');
      } else if (result.persisted === 'server') {
        notify('Discovery profile saved to server.', 'success');
      } else {
        notify('Discovery profile saved.', 'success');
      }
      setIsDirty(false);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (conflict) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e3a5f', margin: '0 0 16px' }}>⚙ Discovery Profile — Sync Conflict</h1>
        <div style={{
          background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 10,
          padding: 20, marginBottom: 24,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
            ⚠ Your local profile and server profile differ
          </div>
          <p style={{ fontSize: 13, color: '#78350f', margin: '0 0 16px' }}>
            This usually happens when the profile was updated on a different device or browser.
            Choose which version to keep. Your other version will be overwritten.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={async () => {
                setProfile(conflict.server);
                setConflict(null);
                setIsDirty(false);
                await saveDiscoveryProfile(conflict.server);
                notify('Kept server profile — local copy updated.', 'success');
              }}
              style={{
                padding: '10px 20px', background: '#1e3a5f', color: '#fff',
                border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
            >Keep Server Profile</button>
            <button
              onClick={async () => {
                setProfile(conflict.local);
                setConflict(null);
                setIsDirty(false);
                await saveDiscoveryProfile(conflict.local);
                notify('Kept local profile — server copy updated.', 'success');
              }}
              style={{
                padding: '10px 20px', background: '#065f46', color: '#fff',
                border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
            >Keep Local Profile</button>
          </div>
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: '🌐 Server profile', data: conflict.server },
              { label: '💻 Local profile', data: conflict.local },
            ].map(({ label, data }) => (
              <div key={label} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#92400e', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 11, color: '#78350f' }}>
                  Include: {(data?.includeTitleKeywords || []).slice(0, 3).join(', ') || '(none)'}{(data?.includeTitleKeywords || []).length > 3 ? ` +${(data.includeTitleKeywords.length - 3)} more` : ''}<br />
                  Exclude: {(data?.excludeTitleKeywords || []).slice(0, 2).join(', ') || '(none)'}<br />
                  Remote: {data?.remotePreference || '—'}<br />
                  Max per run: {data?.maxRecordsPerRun || '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <div style={{ padding: 40, color: '#6b7280' }}>Loading profile…</div>;
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e3a5f', margin: 0 }}>
          ⚙ Discovery Profile
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
          Controls what jobs get discovered. Filters are applied before scoring runs, keeping the approval queue high-signal.
        </p>
        {saveStatus === 'server' && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#065f46' }}>✓ Profile synced to server</div>
        )}
        {saveStatus === 'local_only' && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#92400e' }}>⚠ Profile saved locally only (server unavailable)</div>
        )}
      </div>

      <div style={{
        background: '#fffbeb', border: '1px solid #fde68a',
        borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#92400e',
      }}>
        <strong>Candidate hierarchy (locked):</strong> TPM (primary) → Delivery Manager (secondary) → Ops Manager (conditional) → Program Manager (selective).<br />
        These filters reflect that hierarchy. Do not add titles that contradict it.
      </div>

      {/* Title Include */}
      <TagInput
        label="Include title keywords"
        hint="Jobs with titles containing any of these are passed for scoring."
        value={profile.includeTitleKeywords || []}
        onChange={v => update('includeTitleKeywords', v)}
      />

      {/* Title Exclude */}
      <TagInput
        label="Exclude title keywords"
        hint="Jobs with titles containing any of these are rejected before scoring."
        value={profile.excludeTitleKeywords || []}
        onChange={v => update('excludeTitleKeywords', v)}
      />

      {/* Domain Exclude */}
      <TagInput
        label="Exclude domain keywords"
        hint="Jobs in these industries/domains are rejected (construction, mining, etc.)."
        value={profile.excludeDomainKeywords || []}
        onChange={v => update('excludeDomainKeywords', v)}
      />

      {/* Location preferences */}
      <TagInput
        label="Location preferences"
        hint="Preferred locations (for display and future filtering; does not hard-reject other locations)."
        value={profile.locationPreferences || []}
        onChange={v => update('locationPreferences', v)}
      />

      {/* Remote preference */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Remote/hybrid preference</div>
        <select
          value={profile.remotePreference || 'hybrid'}
          onChange={e => update('remotePreference', e.target.value)}
          style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db' }}
        >
          <option value="remote">Remote only</option>
          <option value="hybrid">Hybrid or remote</option>
          <option value="onsite">On-site acceptable</option>
          <option value="any">Any</option>
        </select>
      </div>

      {/* Max records */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Max records per discovery run</div>
        <input
          type="number"
          min={5}
          max={200}
          value={profile.maxRecordsPerRun || 50}
          onChange={e => update('maxRecordsPerRun', parseInt(e.target.value, 10))}
          style={{ width: 90, padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db' }}
        />
      </div>

      {/* Source families */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Enabled source families</div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
          Note: LinkedIn is not listed — no automated LinkedIn access is implemented.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SOURCE_FAMILIES.map(sf => {
            const enabled = (profile.enabledSourceFamilies || []).includes(sf);
            return (
              <button
                key={sf}
                onClick={() => toggleSource(sf)}
                style={{
                  padding: '6px 14px',
                  background: enabled ? '#1e3a5f' : '#fff',
                  color: enabled ? '#fff' : '#6b7280',
                  border: '1px solid',
                  borderColor: enabled ? '#1e3a5f' : '#d1d5db',
                  borderRadius: 9999,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {SOURCE_LABELS[sf]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          style={{
            padding: '10px 22px',
            background: isDirty ? '#166534' : '#d1d5db',
            color: '#fff',
            border: 'none',
            borderRadius: 7,
            fontWeight: 700,
            fontSize: 14,
            cursor: isDirty ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
        {isDirty && (
          <span style={{ fontSize: 12, color: '#92400e' }}>Unsaved changes</span>
        )}
        {!isDirty && (
          <span style={{ fontSize: 12, color: '#6b7280' }}>Profile is up to date</span>
        )}
      </div>

      <div style={{
        marginTop: 20,
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '12px 16px',
        fontSize: 12,
        color: '#6b7280',
      }}>
        <strong>How this works:</strong> In live mode, profile is saved to the server (Supabase) and
        mirrored locally. In demo mode, localStorage is used. When a discovery run starts,
        the include/exclude filters are applied before scoring. Only matching, non-duplicate
        jobs enter the approval queue. The scoring and lane classification always follow the
        locked candidate hierarchy. If you use multiple devices, the server profile is the
        primary source — conflicts are surfaced at load time for your review.
      </div>
    </div>
  );
}

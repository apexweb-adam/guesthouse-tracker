import React from 'react';
import { LANE_CONFIG } from '../../netlify/functions/_shared/scoring.js';

export default function LaneBadge({ lane }) {
  if (!lane) return null;
  const cfg = LANE_CONFIG[lane];
  if (!cfg) return <span className="badge badge-other">{lane}</span>;
  const cls = {
    tpm: 'badge-tpm',
    delivery_manager: 'badge-delivery',
    ops_manager: 'badge-ops',
    program_manager: 'badge-program',
    generic_pm: 'badge-generic',
    other: 'badge-other',
  }[lane] || 'badge-other';
  return <span className={`badge ${cls}`}>{cfg.short}</span>;
}

import React from 'react';

const LABELS = {
  discovered: 'Discovered',
  queued: 'Queued',
  approved: 'Approved',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  stale: 'Stale',
  ghosted: 'Ghosted',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`status-badge status-${status || 'discovered'}`}>
      {LABELS[status] || status}
    </span>
  );
}

import React from 'react';

const LABELS = {
  discovered: 'Discovered',
  queued: 'Queued',
  approved: 'Approved',
  needs_apply_url: '⚠ Needs Apply URL',
  apply_pack_generated: 'Pack Ready',
  ready_to_apply: 'Ready to Apply',
  applied: 'Applied',
  follow_up_1: 'Follow-Up 1',
  follow_up_2: 'Follow-Up 2',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  stale: 'Stale',
  ghosted: 'Ghosted',
  withdrawn: 'Withdrawn',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`status-badge status-${(status || 'discovered').replace(/_/g, '-')}`}>
      {LABELS[status] || status}
    </span>
  );
}

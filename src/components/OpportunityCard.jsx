import React from 'react';
import { useNavigate } from 'react-router-dom';
import FitScoreBadge from './FitScoreBadge.jsx';
import StatusBadge from './StatusBadge.jsx';
import LaneBadge from './LaneBadge.jsx';

export default function OpportunityCard({ opp, onApprove, onReject, showActions = false }) {
  const nav = useNavigate();
  const cardClass = ['opp-card', opp.isGhosted ? 'ghosted' : opp.isStale ? 'stale' : opp.high_fit ? 'high-fit' : ''].filter(Boolean).join(' ');

  return (
    <div className={cardClass}>
      <div className="opp-card__header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="opp-card__title" onClick={() => nav(`/opportunity/${opp.id}`)}>
            {opp.title}
          </div>
          <div className="opp-card__company">{opp.company}{opp.location ? ` · ${opp.location}` : ''}</div>
        </div>
        <FitScoreBadge score={opp.fit_score} />
      </div>
      <div className="opp-card__meta">
        <LaneBadge lane={opp.lane} />
        <StatusBadge status={opp.status} />
        {opp.isStale && !opp.isGhosted && <span className="badge" style={{ background:'#fef3c7',color:'#92400e' }}>⏳ Stale</span>}
        {opp.isGhosted && <span className="badge" style={{ background:'#fde8e8',color:'#c81e1e' }}>👻 Ghosted</span>}
        {opp.high_fit && <span className="badge" style={{ background:'#d1fae5',color:'#065f46' }}>⭐ High Fit</span>}
        {opp.recommended && <span className="badge" style={{ background:'#dbeafe',color:'#1e40af' }}>👍 Rec</span>}
        {opp.is_target_employer && <span className="badge" style={{ background:'#eff6ff',color:'#1a56db' }}>🎯 Target</span>}
        {opp.is_intermediary && <span className="badge" style={{ background:'#fff7ed',color:'#c2410c' }}>🏢 Intermediary</span>}
      </div>
      {opp.recommendation_text && (
        <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 8, lineHeight: 1.4 }}>
          {opp.recommendation_text}
        </div>
      )}
      {opp.stale_reason && (
        <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>⚠ {opp.stale_reason}</div>
      )}
      <div className="opp-card__footer">
        <span>Added {new Date(opp.ingested_at).toLocaleDateString()}</span>
        <span style={{ cursor: 'pointer', color: 'var(--navy-light)' }} onClick={() => nav(`/opportunity/${opp.id}`)}>
          View →
        </span>
      </div>
      {showActions && opp.approval_state === 'pending' && (
        <div className="opp-card__actions">
          <button className="btn btn-success btn-sm" onClick={() => onApprove && onApprove(opp)}>✓ Approve</button>
          <button className="btn btn-danger btn-sm" onClick={() => onReject && onReject(opp)}>✕ Reject</button>
          <button className="btn btn-secondary btn-sm" onClick={() => nav(`/opportunity/${opp.id}`)}>Review</button>
        </div>
      )}
    </div>
  );
}

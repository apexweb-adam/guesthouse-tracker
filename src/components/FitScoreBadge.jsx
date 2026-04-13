import React from 'react';

export default function FitScoreBadge({ score }) {
  if (score == null) return null;
  const cls = score >= 70 ? 'high' : score >= 45 ? 'mid' : score >= 20 ? 'low' : 'none';
  return <div className={`fit-score ${cls}`}>{score}</div>;
}

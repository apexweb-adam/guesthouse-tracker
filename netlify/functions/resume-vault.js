/**
 * Netlify Function: /resume-vault
 *
 * GET                         → list all resumes in vault
 * POST { action: 'update', id, updates }  → update a resume record
 * POST { action: 'reset' }    → reset vault to defaults
 *
 * No auto-submit. No fabrication. Human must confirm all changes.
 */

import { getResumeVault, upsertResumeVault } from './_shared/db.js';
import {
  INITIAL_VAULT,
  updateVaultRecord,
  resetVaultToDefaults,
  VAULT_STATUS,
} from './_shared/resumeVault.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify(body),
  };
}

async function loadVault() {
  const stored = await getResumeVault();
  return stored || INITIAL_VAULT;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  // ── GET: list vault ────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const vault = await loadVault();
      return json(200, { vault, total: vault.length });
    } catch (err) {
      console.error('[resume-vault GET]', err);
      return json(500, { error: err.message });
    }
  }

  // ── POST: mutations ────────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const { action } = body;

      if (!action) return json(400, { error: 'action is required' });

      // action=update: update a single resume record
      if (action === 'update') {
        const { id, updates } = body;
        if (!id) return json(400, { error: 'id is required for update' });
        if (!updates || typeof updates !== 'object') return json(400, { error: 'updates object is required' });

        const vault = await loadVault();
        const exists = vault.find(r => r.id === id);
        if (!exists) return json(404, { error: `Resume "${id}" not found in vault` });

        const updated = updateVaultRecord(vault, id, updates);
        await upsertResumeVault(updated);
        const record = updated.find(r => r.id === id);
        return json(200, { vault: updated, record, updated: true });
      }

      // action=reset: reset vault to defaults
      if (action === 'reset') {
        const fresh = resetVaultToDefaults();
        await upsertResumeVault(fresh);
        return json(200, { vault: fresh, reset: true });
      }

      return json(400, { error: `Unknown action: ${action}. Valid: update, reset` });
    } catch (err) {
      console.error('[resume-vault POST]', err);
      return json(500, { error: err.message });
    }
  }

  return json(405, { error: 'Method not allowed' });
};

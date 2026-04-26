/**
 * Deduplication Logic
 *
 * Generates a canonical hash from title + company + (normalized URL if present).
 * Opportunities matching the same hash are treated as duplicates.
 */

/**
 * Normalize a string for dedup comparison.
 * Lowercases, strips punctuation, collapses whitespace.
 */
function normalizeForDedup(s = '') {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a URL for dedup — strip tracking params, trailing slashes.
 */
function normalizeUrl(url = '') {
  try {
    const u = new URL(url);
    // Remove common tracking/utm params
    const remove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'trk'];
    remove.forEach(k => u.searchParams.delete(k));
    return u.origin + u.pathname.replace(/\/+$/, '');
  } catch {
    return normalizeForDedup(url);
  }
}

/**
 * Simple non-crypto hash (djb2) — deterministic and fast.
 * We don't need cryptographic strength for dedup.
 */
function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Generate a dedup hash from an opportunity.
 * Uses title + company + URL when URL is present, so same-title/company roles
 * in different postings or locations are not collapsed into one record.
 *
 * @param {object} opp - { title, company, url }
 * @returns {string} hex hash
 */
export function generateDedupHash({ title = '', company = '', url = '' }) {
  const normTitle = normalizeForDedup(title);
  const normCompany = normalizeForDedup(company);
  const normUrl = normalizeUrl(url);

  // Primary: title + company + URL
  if (normTitle && normCompany && normUrl) {
    return djb2(`${normTitle}|${normCompany}|${normUrl}`);
  }

  // Fallback: title + company when no URL is available
  if (normTitle && normCompany) {
    return djb2(`${normTitle}|${normCompany}`);
  }

  // Fallback: title + URL
  if (normTitle && normUrl) {
    return djb2(`${normTitle}|${normUrl}`);
  }

  // Last resort: title only
  return djb2(normTitle || 'unknown');
}

/**
 * Check whether a candidate opportunity is a duplicate of any existing opportunity.
 *
 * @param {object} candidate - incoming opportunity { title, company, url }
 * @param {string[]} existingHashes - array of hashes already in the store
 * @returns {{ isDuplicate: boolean, hash: string }}
 */
export function checkDuplicate(candidate, existingHashes = []) {
  const hash = generateDedupHash(candidate);
  const isDuplicate = existingHashes.includes(hash);
  return { isDuplicate, hash };
}

/**
 * From a batch of incoming opportunities, partition into new vs duplicate.
 *
 * @param {object[]} incoming - array of { title, company, url, ...rest }
 * @param {string[]} existingHashes
 * @returns {{ newItems: object[], duplicates: object[] }}
 */
export function partitionByDedup(incoming, existingHashes = []) {
  const seen = new Set(existingHashes);
  const newItems = [];
  const duplicates = [];

  for (const item of incoming) {
    const hash = generateDedupHash(item);
    if (seen.has(hash)) {
      duplicates.push({ ...item, dedupHash: hash, isDuplicate: true });
    } else {
      seen.add(hash);
      newItems.push({ ...item, dedupHash: hash, isDuplicate: false });
    }
  }

  return { newItems, duplicates };
}

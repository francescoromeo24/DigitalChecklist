/** Up to two initials from a name, e.g. "Luca Rossi" -> "LR". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const chars = parts.slice(0, 2).map((p) => p[0]);
  return chars.join('').toUpperCase();
}

// A small, legible palette (white text sits comfortably on each).
const AVATAR_COLORS = ['#F82B65', '#2F3C48', '#2E7D6B', '#C2571A', '#5B4B8A', '#1F6FB2'];

/** Deterministic colour for a given seed (id or email), stable across renders. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

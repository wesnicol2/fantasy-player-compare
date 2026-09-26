import type { PlayerOption, ScoringPreset } from './types';

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseSharedPath(
  pathname: string,
): { left: string; right: string } | null {
  const match = pathname.match(/^\/compare\/([^/]+)-vs-([^/]+)(?:\/|$)/);
  if (!match) return null;
  try {
    return {
      left: decodeURIComponent(match[1]),
      right: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}

export function scoringFromSearch(search: string): ScoringPreset {
  const value = new URLSearchParams(search).get('scoring');
  return value === 'standard' || value === 'ppr' || value === 'half_ppr'
    ? value
    : 'half_ppr';
}

export function comparisonUrl(
  left: PlayerOption,
  right: PlayerOption,
  scoring: ScoringPreset,
): string {
  const pair = `${encodeURIComponent(left.id)}-vs-${encodeURIComponent(right.id)}`;
  return `/compare/${pair}/${slug(left.name)}-vs-${slug(right.name)}?scoring=${scoring}`;
}

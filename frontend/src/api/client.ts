import type { ComparisonResponse, PlayerOption, ScoringPreset } from '../types';

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

export async function searchPlayers(
  query: string,
  signal?: AbortSignal,
): Promise<PlayerOption[]> {
  if (!query.trim()) return [];
  const response = await fetch(`/api/players?q=${encodeURIComponent(query)}`, {
    signal,
  });
  const payload = await readJson<{ players: PlayerOption[] }>(response);
  return payload.players;
}

export async function comparePlayers(
  left: string,
  right: string,
  scoring: ScoringPreset,
  signal?: AbortSignal,
): Promise<ComparisonResponse> {
  const params = new URLSearchParams({ left, right, scoring });
  return readJson<ComparisonResponse>(
    await fetch(`/api/compare?${params.toString()}`, { signal }),
  );
}

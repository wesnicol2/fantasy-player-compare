import { useEffect, useId, useRef, useState } from 'react';
import { searchPlayers } from '../api/client';
import type { PlayerOption } from '../types';

interface Props {
  label: string;
  selected: PlayerOption | null;
  excludeId?: string;
  onSelect: (player: PlayerOption | null) => void;
}

export function PlayerSearch({ label, selected, excludeId, onSelect }: Props) {
  const inputId = useId();
  const listId = `${inputId}-results`;
  const [query, setQuery] = useState(selected?.name ?? '');
  const [results, setResults] = useState<PlayerOption[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => setQuery(selected?.name ?? ''), [selected]);

  useEffect(() => {
    if (selected && query === selected.name) {
      setResults([]);
      setOpen(false);
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const timer = window.setTimeout(() => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      void searchPlayers(trimmed, controller.signal)
        .then((rows) => {
          const filtered = rows.filter((row) => row.id !== excludeId);
          setResults(filtered);
          setOpen(true);
          setActiveIndex(filtered.length ? 0 : -1);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError')
            return;
          setResults([]);
          setOpen(true);
        })
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [excludeId, query, selected]);

  const choose = (player: PlayerOption) => {
    onSelect(player);
    setQuery(player.name);
    setOpen(false);
    setResults([]);
  };

  return (
    <div className="player-search">
      <label htmlFor={inputId}>{label}</label>
      <div className="search-input-wrap">
        <input
          id={inputId}
          type="text"
          value={query}
          autoComplete="off"
          placeholder="Search player"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
          }
          onFocus={() => {
            if (results.length) setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            if (selected) onSelect(null);
          }}
          onKeyDown={(event) => {
            if (!open || results.length === 0) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((index) =>
                Math.min(results.length - 1, index + 1),
              );
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => Math.max(0, index - 1));
            } else if (event.key === 'Enter' && activeIndex >= 0) {
              event.preventDefault();
              choose(results[activeIndex]);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {selected ? (
          <button
            className="clear-player"
            type="button"
            aria-label={`Clear ${selected.name}`}
            onClick={() => {
              onSelect(null);
              setQuery('');
            }}
          >
            ×
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          className="search-results"
          id={listId}
          role="listbox"
          aria-label={`${label} results`}
        >
          {loading ? <div className="search-status">Searching…</div> : null}
          {!loading && results.length === 0 ? (
            <div className="search-status">No matching current players</div>
          ) : null}
          {results.map((player, index) => (
            <button
              type="button"
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'active' : undefined}
              key={player.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(player)}
            >
              <strong>{player.name}</strong>
              <span className="player-meta">
                {player.position} · {player.team}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

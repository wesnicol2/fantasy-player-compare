export type ScoringPreset = 'standard' | 'half_ppr' | 'ppr';

export interface PlayerOption {
  id: string;
  name: string;
  position: string;
  team: string;
  team_name: string;
}

export interface GraphPoint {
  x: number;
  probability: number;
}

export interface MarketDetail {
  stat_range: [number, number, number];
  stat_mean: number;
  expected_points: number;
  graph: {
    kind: 'continuous_density' | 'discrete_pmf' | 'threshold_gauge';
    points: GraphPoint[];
  };
  anchors: Array<{ threshold: number; survival: number }>;
  lines: Array<{
    book: string;
    source: string;
    point: number | null;
    over_odds: number | null;
    under_odds: number | null;
  }>;
}

export interface PlayerComparisonSide {
  player: PlayerOption;
  coverage: {
    status: 'complete' | 'partial' | 'missing';
    required_markets: string[];
    missing_markets: string[];
  };
  projection: null | {
    floor: number;
    mid: number;
    ceiling: number;
    mean: number;
    curve: Array<{ x: number; survival: number }>;
  };
  matchup: null | {
    opponent: string;
    venue: 'home' | 'away';
    commence_time: string;
    game_total?: number | null;
    team_spread?: number | null;
    team_implied_total?: number | null;
    books_used?: number;
  };
  markets: Record<string, MarketDetail>;
  combined_markets: Record<
    string,
    {
      markets: string[];
      stat_range: [number, number, number];
      stat_mean: number;
      expected_points: number;
    }
  >;
  evidence: { as_of: string | null; stale: boolean };
}

export interface ComparisonResponse {
  scoring: ScoringPreset;
  generated_at: string;
  left: PlayerComparisonSide;
  right: PlayerComparisonSide;
}

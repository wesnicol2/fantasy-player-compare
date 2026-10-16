"""Lazy bridge to the pinned odds-fantasy projection engine.

Keeping imports lazy lets unit tests exercise this service without installing or
calling upstream providers. Runtime uses the exact pinned odds-fantasy model
rather than maintaining a second copy of the projection mathematics.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class VendorModules:
    aggregator: object
    config: object
    graph_data: object
    market_math: object
    odds_client: object
    planner: object
    projection: object
    sleeper_api: object
    weekly_windows: object


def load_vendor() -> VendorModules:
    key = os.getenv("ODDS_API_KEY") or os.getenv("API_KEY")
    if key:
        os.environ.setdefault("API_KEY", key)

    from oddsfantasy import (  # type: ignore[import-not-found]
        aggregator,
        config,
        graph_data,
        market_math,
        odds_client,
        planner,
        projection,
        sleeper_api,
        weekly_windows,
    )

    return VendorModules(
        aggregator=aggregator,
        config=config,
        graph_data=graph_data,
        market_math=market_math,
        odds_client=odds_client,
        planner=planner,
        projection=projection,
        sleeper_api=sleeper_api,
        weekly_windows=weekly_windows,
    )

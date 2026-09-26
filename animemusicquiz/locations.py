from __future__ import annotations

from typing import TYPE_CHECKING

from BaseClasses import Location

from . import items, options

if TYPE_CHECKING:
    from .world import AMQWorld

MAX_QUIZ_COUNT = 10

LOCATION_NAME_TO_ID: Dict[str, int] = {
    "Victory": 90000000,
}

class OFFSET:
    UNIQUE = 10000
    HIGHSCORE = 1000000
    FINALQUIZ = 60000000
    VICTORY = 90000000

for i in range(1, MAX_QUIZ_COUNT + 1):
    ## Quiz Clear Locations
    LOCATION_NAME_TO_ID[f"Quiz {i} Clear"] = i + OFFSET.VICTORY

    for num in range(1, 251):
        ## Unique Song Correct Locations
        LOCATION_NAME_TO_ID[f"Quiz {i} Unique Song Correct - {num}"] = num + (OFFSET.UNIQUE * i)

        ## High Score Locations
        LOCATION_NAME_TO_ID[f"Quiz {i} High Score - {num}"] = num + (OFFSET.HIGHSCORE * i)
        LOCATION_NAME_TO_ID[f"Final Quiz High Score - {num}"] = num + OFFSET.FINALQUIZ

class AMQLocation(Location):
    game = "Anime Music Quiz"
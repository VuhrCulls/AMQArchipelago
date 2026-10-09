from __future__ import annotations

from typing import TYPE_CHECKING

from BaseClasses import Location

from . import items, options

if TYPE_CHECKING:
    from .world import AMQWorld

MAX_QUIZ_COUNT = 10
MAX_SONG_SANITY = 1000

LOCATION_NAME_TO_ID: Dict[str, int] = {
    "Victory": 90000000,
}

class OFFSET:
    SONG_SANITY = 1000
    HIGH_SCORE = 1000000
    FINAL_QUIZ = 60000000
    VICTORY = 90000000

for i in range(1, MAX_SONG_SANITY + 1):
    ## Song Sanity
    LOCATION_NAME_TO_ID[f"{i} Unique Songs Correct"] = OFFSET.SONG_SANITY + i

for i in range(1, MAX_QUIZ_COUNT + 1):
    ## Quiz Clear Locations
    LOCATION_NAME_TO_ID[f"Quiz {i} Clear"] = i + OFFSET.VICTORY

    for num in range(1, 251):
        ## High Score Locations
        LOCATION_NAME_TO_ID[f"Quiz {i} High Score - {num}"] = num + (OFFSET.HIGH_SCORE * i)
        LOCATION_NAME_TO_ID[f"Final Quiz High Score - {num}"] = num + OFFSET.FINAL_QUIZ

class AMQLocation(Location):
    game = "Anime Music Quiz"
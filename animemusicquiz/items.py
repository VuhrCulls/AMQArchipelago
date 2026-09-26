from __future__ import annotations
from typing import TYPE_CHECKING, Dict, Optional

from BaseClasses import Item, ItemClassification
from . import AMQSongLibrary

if TYPE_CHECKING:
    from .world import AMQWorld

MAX_QUIZ_COUNT = 10

class OFFSET:
    FILLER = 70000000
    TRAPS = 80000000
    VICTORY = 90000000

progressive_song_items: Dict[str, int] = {}
victory_items: Dict[str, int] = {
    "Victory": OFFSET.VICTORY
}

for i in range(1, MAX_QUIZ_COUNT + 1):
    progressive_song_items[f"Progressive Song Unlock (Quiz {i})"] = i
    victory_items[f"Quiz {i} Clear"] = OFFSET.VICTORY + i

filler_items: Dict[str, int] = {
    "100 Notes": OFFSET.FILLER + 1,
}

trap_items: Dict[str, int] = {
    "Double Speed Trap": OFFSET.TRAPS + 1,
    "VuhrCulls's Trap - UGANDA MUSIC QUIZ": OFFSET.TRAPS + 2,
    "FeyFey's Trap - Idols WOOOO": OFFSET.TRAPS + 3,
    "FeyFey's Trap - VN Artists": OFFSET.TRAPS + 4,
    "2+8s End Sample Trap": OFFSET.TRAPS + 5,
}

ITEM_NAME_TO_ID: Dict[str, int] = progressive_song_items | filler_items | trap_items | victory_items

class AMQFixedItem(Item):
    game: str = "Anime Music Quiz"

    def __init__(self, name: str, classification: ItemClassification, code: Optional[int], player: int) -> None:
        super().__init__(name, classification, code, player)

class AMQSongItem(Item):
    game: str = "Anime Music Quiz"

    def __init__(self, name: str, player: int, code:Optional[int]) -> None:
        super().__init__(name, ItemClassification.progression, code, player)


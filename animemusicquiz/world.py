#from collections.abc import Mapping
from typing import Any, List

from dataclasses import asdict
from collections import namedtuple

from BaseClasses import ItemClassification, Region, Item
from worlds.AutoWorld import World

from . import items, locations, regions, AMQSongLibrary
from . import options as amq_options
from .locations import AMQLocation
from .items import AMQFixedItem, AMQSongItem

from math import floor, ceil
from rule_builder.rules import Has, HasAll, HasGroup

# TODO: keep unique songIDs as sanity checks up to a certain number
# TODO: starting block for genre and tag algorithm block quizzes
## -> list of genre and tag ids

class AMQWorld(World):
    game = "Anime Music Quiz"
    options_dataclass = amq_options.AMQOptions
    options: amq_options.AMQOptions

    item_name_to_id = items.ITEM_NAME_TO_ID
    location_name_to_id = locations.LOCATION_NAME_TO_ID

    option_list = AMQSongLibrary.OPTION_LIST  ## Quiz Option IDs
    option_count = AMQSongLibrary.OPTION_COUNT ## Quiz Option Count

    item_name_groups = {
        "Progressive": {name for name in items.progressive_song_items.keys()},
        "Filler Items": {name for name in items.filler_items.keys()},
        "Traps": {name for name in items.trap_items.keys()},
    }

    song_items = AMQSongLibrary.SONG_LIST ## FULL DATA, needed to send songids to AMQ

    ## working variables
    starting_songs = {}
    included_songs = {}
    location_count: int
    final_quiz_song_count: int
    randomized_option_list = []  ## Included quizzes + Randomized quizzes

    # TODO: LOL MESSY CODE max quiz count is 10 I guess...
    quiz_song_ids = [[] for i in range(10)]
    quiz_count = {}

    def generate_early(self):
        option_import = list(self.options.include_quiz_types)
        random_option_types = list(self.options.random_quiz_types)
        quiz_count = self.options.quiz_number
        starting_song_count = self.options.starting_song_count.value
        total_song_count = self.options.quiz_song_count.value
        final_quiz_song_count = self.options.final_quiz_song_count.value

        ## Option Randomizer if less quiz_types than quiz_number
        while len(option_import) < quiz_count:
            new_quiz = []
            new_quiz_type = self.random.choice(random_option_types)
            for k,v in self.option_count.items():
                if new_quiz_type in k and v >= total_song_count:
                    new_quiz.append(k)
            option_import.append(self.random.choice(new_quiz))
            continue

        self.randomized_option_list = sorted(option_import, key=str.lower)
        print(self.randomized_option_list)

        # TODO: better way to check for option in option_import
        ## Generate song pool of all quiz songs
        all_songs = []
        for index, quiz in enumerate(self.randomized_option_list):
            option_selected = self.option_list[quiz] # that's option id
            self.quiz_count.update({quiz: 0})
            self.starting_songs.update({quiz: 0})
            for song_key, songData in self.song_items.items():
                if (("Artist - " in quiz and songData.artist_id == option_selected) or
                    ("Composer - " in quiz and songData.composer_id == option_selected) or
                    ("Year - " in quiz and songData.year == option_selected)):
                        all_songs.append((songData.id, quiz, index))


        ## Fill starting songs from all quiz song pools
        self.random.shuffle(all_songs)
        for _ in range(0, starting_song_count):
            starting_song = []
            starting_song.append(all_songs.pop())
            for song_id, quiz, index in starting_song:
                self.starting_songs[quiz] += 1
                self.quiz_count[quiz] += 1
                self.quiz_song_ids[index].append(song_id)

        ## Get quiz and its songs
        for index, quiz in enumerate(self.randomized_option_list):
            option_selected = self.option_list[quiz]
            self.included_songs.update({quiz: 0})
            quiz_songs = []
            for song_key, songData in self.song_items.items():
                if ((("Artist - " in quiz and songData.artist_id == option_selected) or
                    ("Composer - " in quiz and songData.composer_id == option_selected) or
                    ("Year - " in quiz and songData.year == option_selected))
                    and (songData.id) not in self.quiz_song_ids[index]
                    and (songData.id) not in quiz_songs):
                        quiz_songs.append(songData.id)

            ## Fill quiz with remaining songs
            self.random.shuffle(quiz_songs)
            if self.quiz_count[quiz] < total_song_count:
                for _ in range(self.quiz_count[quiz], total_song_count):
                    if len(quiz_songs) <= 0:
                        break
                    self.quiz_song_ids[index].append(quiz_songs.pop())
                    self.included_songs[quiz] += 1
                    self.quiz_count[quiz] += 1

        quiz_song_sum = sum(self.quiz_count.values())
        if final_quiz_song_count > quiz_song_sum:
            self.final_quiz_song_count = quiz_song_sum
        else:
            self.final_quiz_song_count = final_quiz_song_count

        ## Minus one for each quiz type + final quiz to make room for clear items
        self.location_count = (2 * quiz_song_sum) + self.final_quiz_song_count - len(self.quiz_count.keys()) - 1

        ## Prioritize creation of starting songs
        for index, count in enumerate(self.starting_songs.values()):
            for _ in range(0, count):
                self.multiworld.push_precollected(self.create_item(f"Progressive Song Unlock (Quiz {index + 1})"))

    def create_item(self, name:str) -> Item:

        if name in items.filler_items:
            return AMQFixedItem(name, ItemClassification.filler, items.filler_items[name], self.player)
        elif name in items.trap_items:
            return AMQFixedItem(name, ItemClassification.trap, items.trap_items[name], self.player)
        else:
            return AMQSongItem(name, self.player, items.progressive_song_items[name])

    def create_items(self) -> None:
        ## Create song items
        item_count = sum(self.included_songs.values())
        for index, count in enumerate(self.included_songs.values()):
            for _ in range(0, count):
                self.multiworld.itempool.append(self.create_item(f"Progressive Song Unlock (Quiz {index + 1})"))

        ## Create traps
        trap_count = min(self.location_count - item_count, self.get_trap_count())
        trap_list = [trap for trap in items.trap_items.keys()]
        if trap_count > 0:
            for _ in range(0, trap_count):
                index = self.random.randrange(0, len(trap_list))
                self.multiworld.itempool.append(self.create_item(trap_list[index]))

            item_count += trap_count

        items_left = self.location_count - item_count
        if items_left <= 0:
            return

        ## Create filler items
        filler_count = floor(0.8 * items_left)
        items_left -= filler_count
        for _ in range(0, filler_count):
            self.multiworld.itempool.append(self.create_item("100 Notes"))

        ## Create a random assortment of extra progressive song items
        for i in range(0, items_left):
            random_quiz = self.random.randrange(1, len(self.quiz_count.keys()) + 1)
            item = self.create_item(f"Progressive Song Unlock (Quiz {random_quiz})")
            item.classification = ItemClassification.useful
            self.multiworld.itempool.append(item)

    def create_regions(self) -> None:
        ## Menu + Final Quiz Area
        menu_region = Region("Menu", self.player, self.multiworld)
        final_quiz_region = Region("Final Quiz", self.player, self.multiworld)
        self.multiworld.regions += [menu_region, final_quiz_region]
        menu_region.connect(final_quiz_region, "Menu to Final Quiz")

        # TODO: currently unused, would like one region per quiz type
        ## Individual Quiz Regions
        OFFSET = {}
        for index, region_name in enumerate(self.randomized_option_list):
            OFFSET.update({region_name: 0})
            region = Region(f"{region_name}", self.player, self.multiworld)
            self.multiworld.regions += [region]
            menu_region.connect(region, f"Menu to {region}")
            # TODO: currently broken
            # self.set_rule(self.get_entrance(f"Menu to {region}"),HasFromListUnique(*tuple(self.quiz_songs[index]), count = 1))
            OFFSET[region_name] = ((index+1) * 1000000)
        OFFSET.update({"Victory": 90000000})

        # TODO: one region per quiz
        clear_items = []
        for index, quiz in enumerate(self.randomized_option_list, start = 1):
            for i in range(1, self.quiz_count[quiz]+1):
                ## Unique Correct Song Locations
                # region = self.get_region(quiz)
                name = f"Quiz {index} Unique Song Correct - {i}"
                song_rule = Has(f"Progressive Song Unlock (Quiz {index})", count = i)
                loc1 = AMQLocation(self.player, name, self.location_name_to_id[name], menu_region)
                self.set_rule(loc1, song_rule)
                menu_region.locations.append(loc1)

                ## Per-Quiz High Score Locations
                loc2 = AMQLocation(self.player, f"Quiz {index} High Score - {i}", OFFSET[quiz] + i, menu_region)
                self.set_rule(loc2, song_rule)
                if i == ceil(self.quiz_count[quiz] * self.options.quiz_goal / 100):
                    loc2.place_locked_item(AMQFixedItem(f"Quiz {index} Clear", ItemClassification.progression, OFFSET["Victory"] + index, self.player))
                    clear_items.append(f"Quiz {index} Clear")
                menu_region.locations.append(loc2)

        ## Final Quiz Location Creation
        FINAL_QUIZ_UNLOCK = HasAll(*tuple(clear_items))
        menu_to_final = self.get_entrance("Menu to Final Quiz")
        self.set_rule(menu_to_final, FINAL_QUIZ_UNLOCK)
        OFFSET.update({"Final Quiz": 60000000})
        for i in range (1, self.final_quiz_song_count+1):
            loc = AMQLocation(self.player, f"Final Quiz High Score - {i}", OFFSET["Final Quiz"] + i, final_quiz_region)
            rule = FINAL_QUIZ_UNLOCK & HasGroup("Progressive", count=i)
            self.set_rule(loc, rule)
            if i == ceil(self.final_quiz_song_count * self.options.final_quiz_goal / 100):
                loc.place_locked_item(AMQFixedItem("Victory", ItemClassification.progression, OFFSET["Victory"], self.player))
            final_quiz_region.locations.append(loc)
        self.set_completion_rule(Has("Victory"))

    def get_trap_count(self) -> int:
        multiplier = self.options.traps_percentage.value / 100.0
        trap_count = 2 * sum(self.quiz_count.values())
        return max(0, floor(trap_count * multiplier))

    # TODO: check if quiz_counts is even necessary
    ## Sending quiz_song_list for use with AMQ-side per-quiz songList population
    def fill_slot_data(self) -> dict:
        return {
            "player_name": self.multiworld.get_player_name(self.player),
            "player_id": self.player,
            "race": self.multiworld.is_race,
            "quiz_counts": self.quiz_count,
            "quiz_song_list": self.quiz_song_ids,
            "final_quiz_song_count": self.final_quiz_song_count,
        } | {k: v.value for k, v in asdict(self.options).items()}

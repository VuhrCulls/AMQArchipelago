# from collections.abc import Mapping
from typing import Any, List

from dataclasses import asdict
from collections import namedtuple

from BaseClasses import ItemClassification, Region, Item
from worlds.AutoWorld import World

from . import items, locations, AMQSongLibrary
from . import options as amq_options
from .options import ProgressiveQuizzes, ProgressiveSongs
from .locations import AMQLocation
from .items import AMQFixedItem, AMQSongItem

from math import floor, ceil
from rule_builder.rules import Has, HasGroup, True_, HasGroupUnique, HasFromList
from rule_builder.options import OptionFilter


# TODO: starting block for genre and tag algorithm block quizzes
## -> list of genre and tag ids

class AMQWorld(World):
    game = "Anime Music Quiz"
    options_dataclass = amq_options.AMQOptions
    options: amq_options.AMQOptions

    item_name_to_id = items.ITEM_NAME_TO_ID
    location_name_to_id = locations.LOCATION_NAME_TO_ID

    option_list = AMQSongLibrary.OPTION_LIST  ## Quiz Option IDs
    option_count = AMQSongLibrary.OPTION_COUNT  ## Quiz Option Count

    item_name_groups = {
        "Progressive Songs": {name for name in items.progressive_song_items.keys()},
        "Progressive Quiz": {name for name in items.quiz_items.keys()},
        "Filler Items": {name for name in items.filler_items.keys()},
        "Traps": {name for name in items.trap_items.keys()},
    }

    song_items = AMQSongLibrary.SONG_LIST  ## FULL DATA, needed to send songIDs to AMQ

    ## working variables
    starting_songs = {}
    starting_quizzes = []
    included_songs = {}
    location_count: int

    ## variables sent to AMQ
    final_quiz_song_count: int
    song_sanity_count: int
    randomized_option_list = []  ## Included quizzes + Randomized quizzes
    quiz_song_ids = [[] for i in range(10)]  # TODO: LOL MESSY CODE max quiz count is 10 I guess...
    quiz_count = {}

    def generate_early(self):
        option_import = list(self.options.include_quiz_types)
        random_option_types = list(self.options.random_quiz_types)
        quiz_count = self.options.quiz_number
        starting_song_count = self.options.starting_song_count.value
        min_song_count = self.options.quiz_song_min.value
        max_song_count = self.options.quiz_song_max.value
        final_quiz_song_count = self.options.final_quiz_song_count.value

        ## Option Randomizer if less quiz_types than quiz_number
        if not random_option_types:
            random_option_types = ["Artist", "Composer", "Year"]
        while len(option_import) < quiz_count:
            new_quiz = []
            new_quiz_type = self.random.choice(random_option_types)
            for k, v in self.option_count.items():
                if new_quiz_type in k and v >= min_song_count and new_quiz_type not in option_import:
                    new_quiz.append(k)
            option_import.append(self.random.choice(new_quiz))
            continue

        ## Randomize included quizzes if over the given quiz number option
        quiz_list = []
        self.random.shuffle(option_import)
        # maybe a better way?
        quiz_list = option_import[:int(quiz_count)]
        self.randomized_option_list = sorted(quiz_list, key=str.lower)
        # print(self.randomized_option_list)

        # TODO: better way to check for option in option_import
        ## Generate song pool of all quiz songs

        all_songs = []
        for index, quiz in enumerate(self.randomized_option_list):
            option_selected = self.option_list[quiz]  # that's option id
            self.quiz_count.update({quiz: 0})
            self.starting_songs.update({quiz: 0})
            for song_key, songData in self.song_items.items():
                if ((("Artist - " in quiz and songData.artist_id == option_selected) or
                     ("Composer - " in quiz and songData.composer_id == option_selected) or
                     ("Year - " in quiz and songData.year == option_selected))
                        and (songData.id, quiz, index) not in all_songs):
                    all_songs.append((songData.id, quiz, index))
                    # print(songData.id, quiz, option_selected)

        if self.options.progressive_songs:
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
                        and songData.id not in self.quiz_song_ids[index]
                        and songData.id not in quiz_songs):
                    quiz_songs.append(songData.id)
                    # print(songData.id, quiz, option_selected)

            ## Fill quiz with remaining songs
            self.random.shuffle(quiz_songs)
            if self.quiz_count[quiz] < max_song_count:
                for _ in range(self.quiz_count[quiz], max_song_count):
                    if len(quiz_songs) <= 0:
                        break
                    self.quiz_song_ids[index].append(quiz_songs.pop())
                    self.included_songs[quiz] += 1
                    self.quiz_count[quiz] += 1

        # print(self.quiz_count)

        quiz_song_sum = sum(self.quiz_count.values())
        if final_quiz_song_count > quiz_song_sum:
            self.final_quiz_song_count = quiz_song_sum
        else:
            self.final_quiz_song_count = final_quiz_song_count
        if self.options.song_sanity_count.value > quiz_song_sum:
            self.song_sanity_count = quiz_song_sum
        else:
            self.song_sanity_count = self.options.song_sanity_count.value

        ## Minus one for each quiz type + final quiz to make room for clear items
        self.location_count = quiz_song_sum + self.final_quiz_song_count - 1 + self.song_sanity_count
        if self.options.final_quiz_unlock > 0:
            self.location_count -= len(self.quiz_count.keys())

        ## Prioritize creation of starting songs
        if self.options.progressive_songs:
            for index, count in enumerate(self.starting_songs.values()):
                for _ in range(0, count):
                    self.multiworld.push_precollected(self.create_item(f"Progressive Song Unlock (Quiz {index + 1})"))
                    if self.options.progressive_quizzes:
                        self.multiworld.push_precollected(self.create_item(f"Quiz {index + 1} Unlock"))
                        self.starting_quizzes.append(index + 1)

        elif self.options.progressive_quizzes:
            i = self.random.randrange(1, len(self.quiz_count.keys()) + 1)
            self.multiworld.push_precollected(self.create_item(f"Quiz {i} Unlock"))
            self.starting_quizzes.append(i)

    def create_item(self, name: str) -> Item:

        if name in items.filler_items:
            return AMQFixedItem(name, ItemClassification.filler, items.filler_items[name], self.player)
        elif name in items.trap_items:
            return AMQFixedItem(name, ItemClassification.trap, items.trap_items[name], self.player)
        elif name in items.quiz_items:
            return AMQSongItem(name, self.player, items.quiz_items[name])
        else:
            return AMQSongItem(name, self.player, items.progressive_song_items[name])

    def create_items(self) -> None:
        item_count = 0
        for index, count in enumerate(self.included_songs.values()):
            ## Create Progressive Quiz Items
            if self.options.progressive_quizzes:
                if (index + 1) not in self.starting_quizzes:
                    self.multiworld.itempool.append(self.create_item(f"Quiz {index + 1} Unlock"))
                    item_count += 1
            ## Create Progressive Song Items
            if self.options.progressive_songs:
                for _ in range(0, count):
                    self.multiworld.itempool.append(self.create_item(f"Progressive Song Unlock (Quiz {index + 1})"))
                    item_count += 1

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
        # TODO: temp fully fill while useful items aren't option dependent
        # filler_count = floor(0.8 * items_left)
        # items_left -= filler_count
        # for _ in range(0, filler_count):
        for _ in range(0, items_left):
            self.multiworld.itempool.append(self.create_item("100 Notes"))

        ## Create a random assortment of extra progressive song items
        # TODO: make this option-dependent
        # for i in range(0, items_left):
        #     random_quiz = self.random.randrange(1, len(self.quiz_count.keys()) + 1)
        #     item = self.create_item(f"Progressive Song Unlock (Quiz {random_quiz})")
        #     item.classification = ItemClassification.useful
        #     self.multiworld.itempool.append(item)

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
            OFFSET[region_name] = ((index + 1) * 1000000)
        OFFSET.update({"Victory": 90000000})

        ## Unique Correct Songs (Sanity)
        for i in range(1, self.song_sanity_count + 1):
            name = f"{i} Unique Songs Correct"
            loc = AMQLocation(self.player, name, self.location_name_to_id[name], menu_region)
            ## progressive quiz count + 1 for logic leniency, hopefully no brick seeds
            quiz_rule = HasGroup("Progressive Quiz", count=min(
                ceil(i / (sum(self.quiz_count.values()) / len(self.randomized_option_list))) + 1,
                len(self.randomized_option_list)),
                                 options=[OptionFilter(ProgressiveQuizzes, ProgressiveQuizzes.option_true)],
                                 filtered_resolution=True)
            song_rule = HasGroup("Progressive Songs", count=i,
                                 options=[OptionFilter(ProgressiveSongs, ProgressiveSongs.option_true)],
                                 filtered_resolution=True)
            combined_rule = song_rule & quiz_rule
            self.set_rule(loc, combined_rule)
            menu_region.locations.append(loc)

        # TODO: one region per quiz
        clear_items = []
        for index, quiz in enumerate(self.randomized_option_list, start=1):
            for i in range(1, self.quiz_count[quiz] + 1):
                ## Unique Correct Song Locations - being phased out
                # region = self.get_region(quiz)
                # name = f"Quiz {index} Unique Song Correct - {i}"

                # loc1 = AMQLocation(self.player, name, self.location_name_to_id[name], menu_region)
                # self.set_rule(loc1, song_rule)
                # menu_region.locations.append(loc1)

                ## Per-Quiz High Score Locations
                song_rule = Has(f"Quiz {index} Unlock",
                                options=[OptionFilter(ProgressiveQuizzes, ProgressiveQuizzes.option_true)],
                                filtered_resolution=True) & Has(f"Progressive Song Unlock (Quiz {index})", count=i,
                                                                options=[OptionFilter(ProgressiveSongs,
                                                                                      ProgressiveSongs.option_true)],
                                                                filtered_resolution=True)
                loc2 = AMQLocation(self.player, f"Quiz {index} High Score - {i}", OFFSET[quiz] + i, menu_region)
                self.set_rule(loc2, song_rule)
                if self.options.final_quiz_unlock > 0 and i == ceil(
                        self.quiz_count[quiz] * self.options.quiz_goal / 100):
                    loc2.place_locked_item(
                        AMQFixedItem(f"Quiz {index} Clear", ItemClassification.progression, OFFSET["Victory"] + index,
                                     self.player))
                    clear_items.append(f"Quiz {index} Clear")
                menu_region.locations.append(loc2)

        ## Final Quiz Location Creation
        if self.options.final_quiz_unlock > 0:
            clear_items_count = ceil(self.options.final_quiz_unlock * len(clear_items) / 100)
            FINAL_QUIZ_UNLOCK = HasFromList(*tuple(clear_items), count=clear_items_count)
        else:
            FINAL_QUIZ_UNLOCK = True_()
        menu_to_final = self.get_entrance("Menu to Final Quiz")
        self.set_rule(menu_to_final, FINAL_QUIZ_UNLOCK)
        OFFSET.update({"Final Quiz": 60000000})
        for i in range(1, self.final_quiz_song_count + 1):
            loc = AMQLocation(self.player, f"Final Quiz High Score - {i}", OFFSET["Final Quiz"] + i, final_quiz_region)
            quiz_rule = HasGroupUnique("Progressive Quiz", count=min(
                ceil(i / (sum(self.quiz_count.values()) / len(self.randomized_option_list))) + 1,
                len(self.randomized_option_list)),
                                       options=[OptionFilter(ProgressiveQuizzes, ProgressiveQuizzes.option_true)],
                                       filtered_resolution=True)
            song_rule = HasGroup("Progressive Songs", count=i,
                                 options=[OptionFilter(ProgressiveSongs, ProgressiveSongs.option_true)],
                                 filtered_resolution=True)
            rule = FINAL_QUIZ_UNLOCK & quiz_rule & song_rule
            self.set_rule(loc, rule)
            if i == ceil(self.final_quiz_song_count * self.options.final_quiz_goal / 100):
                loc.place_locked_item(
                    AMQFixedItem("Victory", ItemClassification.progression, OFFSET["Victory"], self.player))
            final_quiz_region.locations.append(loc)
        self.set_completion_rule(Has("Victory"))

    def get_trap_count(self) -> int:
        multiplier = self.options.traps_percentage.value / 100.0
        trap_count = sum(self.quiz_count.values()) + self.final_quiz_song_count - 1 + self.song_sanity_count
        if self.options.final_quiz_unlock > 0:
            trap_count -= len(self.quiz_count.keys())
        return max(0, floor(trap_count * multiplier))

    ## Sending quiz_song_list for use with AMQ-side per-quiz songList population
    # TODO: check if song sanity count is needed to be sent to AMQ
    def fill_slot_data(self) -> dict:
        return {
            "player_name": self.multiworld.get_player_name(self.player),
            "player_id": self.player,
            "race": self.multiworld.is_race,
            "quiz_counts": self.quiz_count,
            "quiz_song_list": self.quiz_song_ids,
            "adjusted_final_quiz_song_count": self.final_quiz_song_count,
            "adjusted_song_sanity_count": self.song_sanity_count,
        } | {k: v.value for k, v in asdict(self.options).items()}

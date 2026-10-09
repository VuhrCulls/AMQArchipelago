import json, unicodedata, re, requests
from typing import Dict, List, NamedTuple
from .models import Anime, SongLink, Song, SongCategory, Language, AnimeExtendedInfo, Type
from collections import Counter

class SongData(NamedTuple):
    id: int
    artist_id: int
    composer_id: int
    anime_name: str
    year: int
    song_type: str
    category: str
    quiz: str

def decode_master_list(master_list):
    for master_anime in master_list['animeMap'].values():
        anime = Anime(master_anime)
        anime_ext = AnimeExtendedInfo(master_anime)
        for master_song_links in master_anime['songLinks'].values():
            for master_song_link in master_song_links:
                song_link = SongLink(master_song_link)
                song_link.song = Song.from_master_list(master_list, master_song_link['songId'])
                song_link.anime = anime
                song_link.anime.extended_info = anime_ext
                yield song_link

r = requests.get("https://animemusicquiz.com/libraryMasterList")
if not r.ok:
    print(f"Failed to request master list from AMQ: {r.status_code}")

master_list = r.json()
song_links = [song_link for song_link in decode_master_list(master_list)]

song_results = []
failed_song_results = []

def add_song_to_library (song_link, id, key):
    song_id = song_link.ann_song_id
    song_name = re.sub('[<>]', "", unicodedata.normalize('NFKD', song_link.song.name).encode('ascii', 'ignore').decode('ascii'))

    ## Artist ID
    artist_id = 0
    if "Artist - " in key:
        artist_id = id
    else:
        try:
            if song_link.song.artist.song_artist_id:
                artist_id = song_link.song.artist.song_artist_id
        except AttributeError:
            pass
        try:
            if song_link.song.artist.group_id:
                artist_id = song_link.song.artist.group_id
        except AttributeError:
            pass
        if artist_id == 0:
            print(f"annSongId {id} failed both artist checks")
            artist_id = 6942067

    ## Composer ID
    if "Composer - " in key:
        composer_id = id
    else:
        try:
            composer_id = song_link.song.composer.song_artist_id
        except AttributeError:
            try:
                composer_id = song_link.song.composer.group_id
            except AttributeError:
                composer_id = 6942067

    ## Anime Name
    anime_name_list = song_link.anime.names
    anime_name = ""
    for name in anime_name_list.data:
        if name.language == Language.JAPANESE:
            anime_name = name.name
        if anime_name == "" and name.language == Language.ENGLISH:
            anime_name = name.name
    normal_anime_name = re.sub('[<>]',"",unicodedata.normalize('NFKD', anime_name).encode('ascii', 'ignore').decode('ascii'))

    year = song_link.anime.year
    if song_link.song.category == SongCategory.UNKNOWN:
        category = "Unknown"
    elif song_link.song.category == SongCategory.INSTRUMENTAL:
        category = "Instrumental"
    elif song_link.song.category == SongCategory.CHANTING:
        category = "Chanting"
    elif song_link.song.category == SongCategory.CHARACTER:
        category = "Character"
    elif song_link.song.category == SongCategory.STANDARD:
        category = "Standard"
    else:
        category = "N/A"

    if song_link.type == Type.OPENING:
        song_type = "OP"
    elif song_link.type == Type.ENDING:
        song_type = "ED"
    elif song_link.type == Type.INSERT:
        song_type = "IN"

    item = (song_id,f"{song_name}", artist_id, composer_id, f"{normal_anime_name}", year, song_type, category, f"{key}")
    song_results.append(item)
    #option_song_count.append((artist_id,composer_id,year))


##OPTION_LIST population
artist_count = []
composer_count = []
option_results = []
option_song_count = []

for song_link in reversed(song_links):

    ##artists:
    try:
        artists = song_link.song.artist.artists
        for artist in artists:
            id = artist.song_artist_id
            name = artist.name
            option = (f"Artist - {name}",id)
            option_results.append(option)
            option_song_count.append(f"Artist - {name}")
            add_song_to_library(song_link, id, f"Artist - {name}")
    except AttributeError:
        try:
            id = song_link.song.artist.song_artist_id
            name = song_link.song.artist.name
            option = (f"Artist - {name}",id)
            option_results.append(option)
            option_song_count.append(f"Artist - {name}")
            add_song_to_library(song_link, id, f"Artist - {name}")
        except AttributeError:
            pass

    ##composers:
    try:
        composers = song_link.song.composer.artists
        for composer in composers:
            id = composer.song_artist_id
            name = composer.name
            option = (f"Composer - {name}",id)
            option_results.append(option)
            option_song_count.append(f"Composer - {name}")
            add_song_to_library(song_link, id, f"Composer - {name}")
    except AttributeError:
        try:
            id = song_link.song.composer.song_artist_id
            name = song_link.song.composer.name
            option = (f"Composer - {name}",id)
            option_results.append(option)
            option_song_count.append(f"Composer - {name}")
            add_song_to_library(song_link, id, f"Composer - {name}")
        except AttributeError:
            pass

    ##year:
    year = song_link.anime.year
    option = (f"Year - {year}", year)
    option_results.append(option)
    option_song_count.append(f"Year - {year}")
    add_song_to_library(song_link, year, f"Year - {year}")


OPTION_LIST: Dict [str, int] = {option_name: option_id for option_name, option_id in list(set(option_results))}
OPTION_COUNT: Dict [str, int] = {option_name: option_count for option_name, option_count in Counter(sorted(option_song_count)).items()}

#OPTION_COUNT: Dict [str, int] = {"Artist - Maaya Sakamoto": 87}
#option_name : option_count for option_name, option_count in Counter((song for song in songData.artist_id) == option_id) in option_song_count


SONG_LIST: Dict[str, SongData] = {f"{song_name} ({key})": SongData(id, artist, composer, anime_name, year, song_type, category, key) for id, song_name, artist, composer, anime_name, year, song_type, category, key in song_results}
#for option_id in OPTION_LIST.values():
#    a = Counter(
#    OPTION_COUNT = {option_id: option_count for

with open("option_list.json", 'w', encoding="utf-8") as f:
    #json.dump(results, f, ensure_ascii=False)
    for k,v in OPTION_LIST.items():
        f.write(f"{k}: {v},\n")

with open("option_count.json", 'w', encoding="utf-8") as f:
    #json.dump(results, f, ensure_ascii=False)
    for k,v in OPTION_COUNT.items():
        f.write(f"{k}: {v},\n")

#with open("song_list.txt", 'w', encoding="utf-8") as f:
    #json.dump(results, f, ensure_ascii=False)
    #for k,v in SONG_LIST.items():
        #f.write(f"{SONG_LIST},\n")
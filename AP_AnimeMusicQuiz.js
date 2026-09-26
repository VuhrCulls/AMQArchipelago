// ==UserScript==
// @name         AP_AnimeMusicQuiz
// @namespace    http://tampermonkey.net/
// @version      0.0.0beta
// @description  Archipelago client for Anime Music Quiz
// @author       SakuraPianist
// @match        https://animemusicquiz.com/*
// @match        https://*.animemusicquiz.com/*
// @require      https://github.com/joske2865/AMQ-Scripts/raw/master/common/amqScriptInfo.js
// @downloadURL
// @updateURL
// @top-level-await
// ==/UserScript==

/* TO DO
##idk
!! Hint System I have no idea !!

##ARCHIPELAGO SIDE (python)##
!! Songs with Group Artist + Composers are unusable !! AMQSongLibrary fix

quiz option combos to allow year, type, category randomization from being wack
variable regions instead of everything in menu_region -> does this even matter or is it just bc clean code
algorithm block customization


##AMQ SIDE (javascript)##
find a way to populate finished checks every time you connect
  -> high scores + unique songid corrects don't come back on game hard reset
backspace doesn't work again
chat icons

algorithm block customization

no disconnect from ap, only reload amq

toast announcements testing

Current max quiz count is 20 idk how else except hard code
-> button gen to match quiz type number

 */

const {Client, itemsHandlingFlags} = await import(
    // Switched to a fork because main repo has a bug on hint ordering
    "https://unpkg.com/@airbreather/archipelago.js@2.0.5-airbreather"
    );

"use strict";

console.log("AP AnimeMusicQuiz loaded");

//ToastLibary, for Announcements
const cssToast = document.createElement("link");
cssToast.href = "https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css";
cssToast.type = "text/css";
cssToast.rel = "stylesheet";
document.head.append(cssToast);

const scriptToast = document.createElement("script");
scriptToast.src = "https://cdn.jsdelivr.net/npm/toastify-js";
scriptToast.type = "text/javascript";
document.head.append(scriptToast);

// Input fields
const apMenuContainer = document.createElement("div");
apMenuContainer.id = "apMenu";

apMenuContainer.innerHTML = `
    <div id="apMenuArrow"> < </div>
    <form id="apConnectionForm">
        <fieldset id="apConnectionFields">
            <legend style="color:white">Connect to your AP server</legend>
            <input name="hostname" placeholder="Address"/>
            <input name="port" placeholder="Port (38281 for local games)"/>
            <input name="slot" placeholder="Slot Name"/>
            <input name="password" placeholder="Password" type="password"/>
            <button style="color:#555555" type="submit">Connect</button>
            <br/>
            <span id="apFormError" class="APhide"></span>
        </fieldset>
    </form>
    <form id="apHintForm">
        <fieldset id="apHintFields" disabled>
            <input name="item" placeholder="Item name" list="itemList">
            <datalist id="itemList">/* populated after connection */</datalist>
            <input style="color:#555555" type="submit" value="Hint this!">
        </fieldset>
    </form>
`;


const formStyle = `
    #apMenu {
        margin: 0;
        padding: 15px;
        position: absolute;
        top: 30%;
        left: 0;
        z-index: 99999;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
        width: 20%;
        background-color: #1B1B1B;
        box-sizing: content-box;
        transition: 0.5s;

        &.isClosed {
          left: -21.5%;
        }
    }
    #apFormError {
        color: red;
        font-weight: bold;
    }
    #apMenuArrow {
        position: absolute;
        right: -20px;
        background-color: #1B1B1B;
        padding: 10px;
        border-radius: 10px;
    }
    #apConnectionForm {
        color: #555555;
    }
    #apConnectionFields:disabled {
        color: white;
    }
    #apHintForm:disabled {
        color: white;
    }
`;

const consoleInput = document.createElement("input")
consoleInput.id = "apCommandInput"
consoleInput.placeholder = "!command"
consoleInput.disabled = true;

// Console
consoleInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        window.client.messages.say(consoleInput.value);
        consoleInput.value = "";
    }
});
apMenuContainer.append(consoleInput);

// Settings panel
let apClientSettings = { // init for code completion <3
    hideHints: '',
    hideConnection: '',
    hideOtherItems: '',
}
apClientSettings = JSON.parse(localStorage.apClientSettings || "{}");
let onApClientSettingUpdate = setting => {
};

const settingsPanel = document.createElement("div");
settingsPanel.id = "apSettingsPanel";

settingsPanel.innerHTML = `
<details><summary >AP client settings</summary>
    <fieldset><legend style="color:white">Notification filters</legend>
        <label><input type="checkbox" name="hideHints" ${apClientSettings.hideHints ? "checked" : ""} />Hide hints</label>
        <label><input type="checkbox" name="hideConnection" ${apClientSettings.hideConnection ? "checked" : ""} />Hide players joining and leaving</label>
        <label><input type="checkbox" name="hideOtherItems" ${apClientSettings.hideOtherItems ? "checked" : ""} />Hide checks for other games</label>
    </fieldset>
    <br/>
    <button id="apDanger">RESET SAVE</button>
</details>
`

const settingsStyle = `
    #apSettingsPanel {
        & label {
          display: block;
        }
        & summary {
          margin-bottom: 10px;
        }
    }
    #apDanger {
        background-color: #D32F2F;
        color: white;
    }
`;

settingsPanel.querySelectorAll('input').forEach(input => input.addEventListener("change", e => {
    apClientSettings[e.target.name] = e.target.checked;
    onApClientSettingUpdate(e.target.name)
    localStorage.apClientSettings = JSON.stringify(apClientSettings);
}));

apMenuContainer.append(settingsPanel);

document.body.prepend(apMenuContainer);

// Injecting AP client style
const style = document.createElement("style");
style.textContent = `
    .hinted { opacity: 1 !important }
    .APhide { display: none !important }
` + formStyle + settingsStyle;
document.head.append(style);

function typeToText(element) {
    const id = Number(element.text);

    if (element.type === "player_id" && !isNaN(id)) {
        return window.client.players.findPlayer(parseInt(element.text, 10))?.alias;
    } else if (element.type === "item_id" && !isNaN(id)) {
        return window.client.package.lookupItemName(
            window.client.players.findPlayer(element.player)?.game ?? "",
            parseInt(element.text, 10),
        );
    } else if (element.type === "location_id" && !isNaN(id)) {
        return window.client.package.lookupLocationName(
            window.client.players.findPlayer(element.player)?.game ?? "",
            parseInt(element.text, 10),
        );
    } else if (element.text !== undefined) {
        return element.text;
    } else {
        return element;
    }
}

function packetToText(packet) {
    if (packet === undefined) {
        return "";
    }
    let msg = "";
    packet.forEach((element) => {
        msg += typeToText(element);
    });
    return msg;
}

function sendCheckIdToAp(id) {
    window.client.check(id);
    // Essential to avoid discrepancies between AP server state and CC local save
    // We could do a full check after each game load to sync both, with forced Game.Win/Game.RemoveAchiev
    //Game.WriteSave();
}

function connectAP(e) {
    e.preventDefault();
    console.debug("CONNECTION ATTEMPT", e);
    window.client = new Client();

    const fields = document.getElementById("apConnectionFields");
    const apFormError = document.getElementById("apFormError");
    fields.disabled = true;
    apFormError.classList.add("APhide");

    const handleError = error => {
        console.error("Error during connection attempt: ", error.toString())
        document.getElementById("apConnectionFields").disabled = true;
        apFormError.textContent = error.toString();
        apFormError.classList.remove("APhide");
        fields.disabled = false;
    };

    const {hostname, port, slot, password} = e.target;
    if (!hostname.value || !port.value || !slot.value) {
        handleError("Address, Port and Slot Name should not be empty!");
        return;
    }

    if (parseInt(port.value) !== parseInt(localStorage.getItem("port"))) {
        if (
            confirm(
                "Your Port changed, so this might be a new Game. DELETE LOCAL SAVE GAME?\nCancel to load your save normally.",
            ) === true
        ) {
            resetAP();
        }
    }

    let self = this;
    const connectionInfo = {
        password: password.value,
        items_handling: itemsHandlingFlags.all,
    };
    const url = hostname.value + ":" + port.value;

    // If connected
    window.client.socket.disconnect();

    // Set up event listeners
    window.client.socket.on("connected", async (packet) => {
        console.log("Connected to server: ", packet);
        await appendFunctions();
        save();
    });

    window.client.socket.on("roomUpdate", (packet) => {
        console.log("Room update: ", packet);
    });

    window.client.socket.on("receivedItems", async (packet) => {
        while (!gameAPReady) {
            console.debug("Game data not ready... delaying item receiving")
            await new Promise(res => setTimeout(res, 100));
        }
        console.log("Received Items: ", packet);

        // When items.length > 1 it's a reconnect
        if (packet.items.length > 1) {
            const difference = [];

            const receiveNewItem = networkItem => {
                receiveItem(networkItem.item, true);
                toast(null, {
                    receiving: window.client.players.self.slot,
                    item: networkItem,
                    type: "ItemSend"
                });
                difference.push(networkItem.item);
            }

            const receivedItemsById = Object.groupBy(receivedItems || [], x => x);
            const networkItemsById = Object.groupBy(packet.items, x => x.item);
            for (let id in networkItemsById) {
                if (!receivedItemsById[id]) {
                    // New item
                    networkItemsById[id].forEach(i => receiveNewItem(i, true));
                } else if (receivedItemsById[id].length < networkItemsById[id].length) {
                    // Further occurrences of fillers, progressive... any item that can appear multiple times.
                    // FIXME regression: fillers obtained while away are not skipped anymore
                    const missing = networkItemsById[id].length - receivedItemsById[id].length;
                    for (let i = 0; i < receivedItemsById[id].length; i++) receiveItem(id, false);
                    for (let i = 0; i < missing; i++) receiveNewItem(networkItemsById[id][0]);
                } else {
                    networkItemsById[id].forEach(i => receiveItem(id, false));
                }
            }
            // Compare serverItems with local saved (and executed Items)
            console.log("serverItems", packet.items.map(x => x.item));
            console.log("receivedItems", receivedItems);
            console.log("difference", difference);
        } else {
            // Just one Item means its new > always use
            receiveItem(packet.items[0].item, true);
        }
    });

    window.client.socket.on("locationInfo", (packet) => {
        console.log("Hint: ", packet);
        self.hints.concat(packet.items);
    });

    window.client.socket.on("printJSON", (packet) => {
        console.debug("Print JSON: ", packet);
        let msg = packetToText(packet.data);
        if (msg === "") {
            return;
        }
        console.log("MSG: " + msg);
        toast(msg, packet);
    });

    // Connect to the Archipelago server
    window.client
        .login(url, slot.value, gameName, connectionInfo)
        .then(() => {
            console.log("Connected to the server");

			// Populates AP Client Hint Field with itemList
            document.getElementById("apHintFields").disabled = false;
            consoleInput.disabled = false;
			const itemList = document.getElementById("itemList");
            Object.keys(window.client.package.findPackage(gameName).itemTable).forEach(item => itemList.innerHTML += `<option value="${item}">`);
        })
        .catch(handleError);

    // Disconnect from the server when unloading window
    window.addEventListener("beforeunload", () => {
        window.client.socket.disconnect();
    });
}

const hintItem = e => {
    e.preventDefault();
    window.client.messages.say("!hint " + e.target.item.value)
        .then(() => e.target.item.value = "");
}

const toggleMenu = () => {
    apMenuContainer.classList.toggle("isClosed");
    document.getElementById("apMenuArrow").textContent = apMenuContainer.classList.contains("isClosed") ? ">" : "<";
}

document.getElementById("apConnectionForm").addEventListener("submit", connectAP);
document.getElementById("apHintForm").addEventListener("submit", hintItem);
document.getElementById("apMenuArrow").addEventListener("click", toggleMenu);
document.getElementById("apDanger").addEventListener("click", resetAP);


/////////////////
//GAME SETTINGS//
/////////////////

const gameName = "Anime Music Quiz";
let gameAPReady = false;
let goalCorrectPercent = 1000; // Default value prevent accidental goaling
let receivedItems = [];
let currentList = [];
let songList = []; //playable songList, 0 final, 1+ indiv. quizzes
let correctList = []; // unique songids, 1+ indiv. quizzes
let correctCount = 0; //only current quiz attempt
let highScore = []; // 0 final, 1+ indiv. quizzes
let heldTraps = [];
let queuedTraps = [];
let currentIndex = 0;
let finalQuizEnabled = "Locked";
let progressiveItems = [];
let clearItems = [];

// Fields should be the same as Options.py
const gameOptions = { //RECHECK
    quiz_counts: {}, //dict
    quiz_song_list: [], //Master list to populate songList
    quiz_number: 1,
    quiz_song_count: 20,
    quiz_goal: 70,
    final_quiz_song_count: 100,
    final_quiz_goal: 70,
    guess_time: 20,
    starting_song_count: 5,
    quiz_types: [],
};

// FIXME: form fields should be stored in a APGame object or something but too much refacto for one commit. quick compat fix and will do at later time
const {hostname, port, slot: name, password} = document.getElementById("apConnectionForm");

function save() {
    console.log("Saving...");
    localStorage.setItem("receivedItems", JSON.stringify(receivedItems));
    localStorage.setItem("songList", JSON.stringify(songList));
    localStorage.setItem("correctList", JSON.stringify(correctList));
	localStorage.setItem("highScore", JSON.stringify(highScore));
    localStorage.setItem("queuedTraps", JSON.stringify(queuedTraps));
    localStorage.setItem("host", hostname.value);
    localStorage.setItem("port", port.value);
    if (port.value === "") localStorage.setItem("port", "38281"); //Handle blank port -> default port
    localStorage.setItem("name", name.value);
    localStorage.setItem("password", password.value);
}

function load() {
    console.log("Loading...");
    receivedItems = JSON.parse(localStorage.getItem("receivedItems")) || [];
    songList = JSON.parse(localStorage.getItem("songList")) || [];
    highScore = JSON.parse(localStorage.getItem("highScore")) || [];
    correctList = JSON.parse(localStorage.getItem("correctList")) || [];
    queuedTraps = JSON.parse(localStorage.getItem("queuedTraps")) || [];

    console.log(
		"Received Items:", receivedItems,
		"Song List:", songList,
		"High Score:", highScore,
		"Correct List:", correctList,
		"Queued Traps:", queuedTraps
	);

    let urlParams = new URLSearchParams(window.location.search);
    hostname.value =
        urlParams.get("host") ||
        urlParams.get("Host") ||
        localStorage.getItem("host") ||
        hostname.value ||
        "archipelago.gg";
    port.value =
        urlParams.get("port") ||
        urlParams.get("Port") ||
        localStorage.getItem("port") ||
        port.value ||
        "";
    name.value =
        urlParams.get("name") ||
        urlParams.get("Name") ||
        localStorage.getItem("name") ||
        name.value ||
        "";
    password.value =
        urlParams.get("password") ||
        urlParams.get("Password") ||
        localStorage.getItem("password") ||
        password.value ||
        "";
}

function resetAP(e) {
    if (!confirm("This will reset your AMQ save and received AP items. Continue?")) {
        e.preventDefault();
    } else {
        console.log("=== Deleting Save... ===");
        receivedItems = [];
        songList = [];
        highScore = [];
        correctList = [];
		progressiveItems = [];
        localStorage.setItem("songList", "[]");
        localStorage.setItem("highScore", "[]");
        localStorage.setItem("correctList", "[]");
        localStorage.setItem('receivedItems', "[]");
        localStorage.setItem('queuedTraps', "[]");
    }
}

load();

// For this game we use the Games Chat, not the default Toast ////// LINK TO AMQ CHAT
function toast(message, {receiving, item, type} = {}) {

    if (type === "error") {
        sendSystemMessage("⚠️ " && `${message}`);
        //Game.APNotify("Error", message, [1, 7]); // "!" icon
        return;
    }

    const me = window.client.players.self;

    if (receiving === me.slot) {
        if (type === "ItemSend") {
            const sender = window.client.players.findPlayer(item.player);
            const senderName = sender.slot === window.client.players.self.slot ? "You" : sender.alias;
            const locationName = window.client.package.lookupLocationName(sender.game, item.location);

            let id;
            let name = window.client.package.lookupItemName(gameName, item.item);
            let icon;

            //Game.Notify("Item received", `<span class="itemSend">${senderName} just found your <b>${name}</b> at ${locationName} !</span>`, icon);
            sendSystemMessage(`[Item]: ${senderName} just found your ${name} at ${locationName}`);
            //OFFSET.ITEMS.isUpgrade(item.item) && Game.NotifyTooltip("function(){return Game.crateTooltip(Game.UpgradesById[" + id + "]);}");
            //OFFSET.ITEMS.isUpgrade(item.item);
            window.client.return;
        }
    }
    if (type === "Hint") {
        //const icon = [0, 8]; // Question marks
        const receiver = window.client.players.findPlayer(receiving);
        const sender = window.client.players.findPlayer(item.player);
        const itemName = window.client.package.lookupItemName(receiver.game, item.item);
        const locationName = window.client.package.lookupLocationName(sender.game, item.location);

        if (apClientSettings.hideHints) {
            console.debug("Skipped hint notification (user settings)");
            return;
        }

        //Game.APNotify("Hint", `${receiver.alias}'s <b>${itemName}</b> is located at <b>${locationName}</b> in ${sender.alias}'s world</div>`, icon);
        sendSystemMessage("[Hint]: " && `${receiver.alias}'s <b>${itemName}</b> is located at <b>${locationName}</b> in ${sender.alias}'s world</div>`);
        item.player === window.client.players.self.slot
        //&& Game.APNotifyTooltip('function(){return Game.crateTooltip(Game.AchievementsById['+(item.location-OFFSET.ACHIEVEMENTS)+']);}');
        return;
    }

    if (apClientSettings.hideOtherItems && type === "ItemSend" && item.player !== me.slot) {
        console.debug("Skipped check notification (user settings)");
        return;
    }
    if (apClientSettings.hideConnection && (type === "Join" || type === "Part")) {
        console.debug("Skipped join/leave notification (user settings)");
        return;
    }

    //Game.APNotify("Archipelago", message);
    sendSystemMessage(message);
    //if (type === "ItemSend" && item.player === me.slot) Game.APNotifyTooltip("function(){return Game.crateTooltip(Game.AchievementsById[" + (item.location - OFFSET.ACHIEVEMENTS) + "]);}");

	//trialing this toastify thing
    Toastify({
        text: message,
        duration: 5000
      }).showToast();
}

const OFFSET = {
    ITEMS: {
        FILLERS: 70000000,
        TRAPS: 80000000,
	VICTORY: 90000000,
        isFiller: id => Math.floor(id / 10000000) * 10000000 === OFFSET.ITEMS.FILLERS,
        isTrap: id => Math.floor(id / 10000000) * 10000000 === OFFSET.ITEMS.TRAPS,
        isVictory: id => Math.floor(id / 10000000) * 10000000 === OFFSET.ITEMS.VICTORY,
    },
	LOCATIONS: { //multiplied by currentIndex
		SONG: 10000, //theoretical max is 250 songs * 99 quizzes before offset needs to be changed
		QUIZ: 1000000, //theoretical max is 59 quizzes before offset needs to be changed
		FINAL: 60000000,
	}
}

function receiveItem(item, firstTime) {
    let itemId = parseInt(item);
    console.log(itemId, item);

    if (firstTime) {
        receivedItems.push(itemId);
        console.log(`I apply a new item! ${itemId}`);
        if (OFFSET.ITEMS.isFiller(itemId)) {
            switch (itemId) {
                case OFFSET.ITEMS.FILLERS + 1 :
                    console.log("[AP] Receiving 100 Notes Filler:", itemId);
                    break;
            }
        } else if (OFFSET.ITEMS.isTrap(itemId)) {
			heldTraps.push(itemId);
            switch (itemId) {
                case OFFSET.ITEMS.TRAPS + 1 :
                    console.log("[AP] Receiving Double Speed Trap:", itemId);
                    break;
                case OFFSET.ITEMS.TRAPS + 2 :
                    console.log("[AP] Receiving VuhrCulls's Trap - UGANDA MUSIC QUIZ:", itemId);
                    break;
                case OFFSET.ITEMS.TRAPS + 3 :
                    console.log("[AP] Receiving FeyFey's Trap - Idols WOOOO:", itemId);
                    break;
                case OFFSET.ITEMS.TRAPS + 4 :
                    console.log("[AP] Receiving FeyFey's Trap - VN Artists:", itemId);
                    break;
		case OFFSET.ITEMS.TRAPS + 5 :
			console.log("[AP] Receiving 2+8s End Sample Trap:", itemId);
                    break;
            }
        } else if (OFFSET.ITEMS.isVictory(itemId)) {
            clearItems.push(itemId);
			if (itemId === OFFSET.ITEMS.VICTORY) {
				console.log("[AP] Receiving Victory Item:", itemId);
				sendCheckIdToAp(90000000);
				window.client.goal();
			} else {
				console.log("[AP] Receiving Quiz ", itemId - OFFSET.ITEMS.VICTORY," Clear Item:", itemId);
			}
        } else {
			console.log("[AP] Receiving Progressive Song Unlock (Quiz ", itemId,")");

			//Update progressive item counts
			let counts = {};
			for (let num of receivedItems) {
				counts[num] = counts[num] ? counts[num] + 1 : 1;
			}

			let songId = gameOptions.quiz_song_list[itemId - 1][counts[itemId] - 1];
			if (songId) {
                if (!songList[itemId]?.includes(songId)) {
				    (songList[itemId] ??= []).push(songId);
			    }
                if (!songList[0]?.includes(songId)) {
                    (songList[0] ??= []).push(songId);
			    }
            }

        }
    }
    save();
}

async function appendFunctions() {

    // Read all game options
    await window.client.players.self.fetchSlotData().then((slotData) => {
        console.log(slotData);

        // Set song_goal as goalCorrectPercent
        goalCorrectPercent = slotData.final_quiz_goal;

		// Populate gameOptions
        Object.keys(gameOptions).forEach(optionName => gameOptions[optionName] = slotData[optionName]);
        console.log("Game options:", gameOptions);

        //Update gameOptions.quiz_types with any randomized quizzes
        gameOptions.quiz_types = Object.keys(gameOptions.quiz_counts);
        gameOptions.final_quiz_song_count = Math.min(slotData.quiz_song_list.flat().length, gameOptions.final_quiz_song_count);
    });

    gameAPReady = true;
    console.log("gameAPReady: ", gameAPReady);
    setup();
}

/////////////////////////////
// AMQ+ REBUILD FOR AMQ AP //
/////////////////////////////

/**
 * Check if script should be disabled based on game mode
 * Disables script in Jam, Ranked, or Themed mode
 */
function shouldDisableScript() {
    // Check if we're in a restricted game mode
    if (typeof lobby !== 'undefined' && lobby.inLobby && lobby.settings) {
        const gameMode = lobby.settings.gameMode;
        if (gameMode === "Jam" || gameMode === "Ranked" || gameMode === "Themed") {
            return true;
        }
    }

    if (typeof quiz !== 'undefined' && quiz.inQuiz && quiz.gameMode) {
        const gameMode = quiz.gameMode;
        if (gameMode === "Jam" || gameMode === "Ranked" || gameMode === "Themed") {
            return true;
        }
    }

    return false;
}

//Settings state
let amqAPEnabled = false;

// Quiz state
let currentQuizData = null;
let currentQuizId = null;
let currentQuizInfo = null;
let selectedCustomQuizId = null;
let selectedCustomQuizName = null;
let dataTemplate = [];

// Player list and song tracking state
let currentSongNumber = 0;
let trapState = false;

//UI state
let isWaitingForQuizList = false;
let quizListAttempts = 0;
let pendingQuizData = null;

// Quiz re-roll prevention flag
let quizFetchedBeforeGameStart = false;
let isApplyingRoomSettingsQuiz = false;

function setup() {
    console.log("[AP] Starting setup...");
    // Always start with AMQ+ disabled on page refresh (don't restore enabled state)
    amqAPEnabled = false;
    createUI(); //not created yet, would just want the amq ap button anyways
    setupListeners();
    hijackStartButton(); //maybe in the future, could be nice
    //setupQuizSavedModalObserver(); //no idea what this is for
    //setupQuizCreatorExportButton();
    //setupSocketCommandInterceptor(); //possibly needed, we'll see

    //Setup Room Settings hijacking when entering lobby
    //setupRoomSettingsHijackOnLobbyEnter(); let's just replace this with a fetchquiz()

    //need archipelago setup here

    console.log("[AP] Setup complete! Enabled:", amqAPEnabled);
}

function hijackStartButton() { //haven't gotten this to work before
    console.log("[AP] Setting up start button click prevention...");

    // Use MutationObserver to watch for start button appearance/changes
    const startButtonObserver = new MutationObserver(() => {
        const startButton = $("#lbStartButton");
        if (startButton.length === 0) return;

        // Remove any existing handlers to avoid duplicates
        startButton.off("click.amqAP");

        // Attach click handler
        startButton.on("click.amqAP", function (e) {
            const buttonText = startButton.find("h1").text().trim();

            // Only check for "Start" button, not "Ready" or other states
            if (buttonText !== "Start") {
                return; // Let normal behavior proceed
            }

            // Disable script in restricted modes (Jam, Ranked, Themed)
            if (shouldDisableScript()) {
                console.log("[AP] Script disabled: Jam, Ranked, or Themed mode detected");
                return; // Let normal behavior proceed
            }

            // Check if AP is enabled and quiz needs to be fetched
            if (amqAPEnabled) {
                console.log("[AP] Start button clicked, AP enabled, checking AP connection status...");

                if (selectedCustomQuizName && selectedCustomQuizName.startsWith("AP")) {
                    // Check if quiz has been fetched and saved
                    // Quiz is ready if: currentQuizId exists AND quizFetchedBeforeGameStart is true
                    const isQuizReady = quizFetchedBeforeGameStart;

                    if (!isQuizReady) {
                        console.log("[AP] Quiz not fetched yet, preventing start.");
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();

                        messageDisplayer.displayMessage(
                            "Quiz Not Ready",
                            "Please connect to AP server before starting."
                        );
                        return false;
                    } else {
                        console.log("[AP] Quiz already fetched and ready, allowing start");
                        // Quiz is ready, allow normal start
                    }
                }
                // If no AP quiz selected, allow normal start
            }
            // If AP not enabled, allow normal start
        });
    });

    // Observe the lobby page for start button
    const lobbyContainer = $("#lobbyPage");
    if (lobbyContainer.length > 0) {
        startButtonObserver.observe(lobbyContainer[0], {
            childList: true,
            subtree: true
        });
    }

    // Also check immediately in case button already exists
    setTimeout(() => {
        const startButton = $("#lbStartButton");
        if (startButton.length > 0) {
            startButton.off("click.amqAP");
            startButton.on("click.amqAP", function (e) {
                const buttonText = startButton.find("h1").text().trim();

                if (buttonText !== "Start") {
                    return;
                }

                // Disable script in restricted modes (Jam, Ranked, Themed)
                if (shouldDisableScript()) {
                    console.log("[AP] Script disabled: Jam, Ranked, or Themed mode detected");
                    return; // Let normal behavior proceed
                }

                if (amqAPEnabled) {
                    console.log("[AP] Start button clicked, AP enabled, checking quiz status...");

                    if (selectedCustomQuizName && selectedCustomQuizName.startsWith("AP")) {
                        const isQuizReady = quizFetchedBeforeGameStart;

                        if (!isQuizReady) {
                            console.log("[AP] Quiz not fetched yet, preventing start.");
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();

                            messageDisplayer.displayMessage(
                                "Quiz Not Ready",
                                "Please wait for the AP quiz to be fetched before starting the game. The quiz will be automatically loaded when ready."
                            );
                            return false;
                        } else {
                            console.log("[AP] Quiz already fetched and ready, allowing start");
                        }
                    }
                }
            });
        }
    }, 500);

    console.log("[AP] Start button click prevention setup complete");
}

function generateCommand() {
    dataTemplate = `{"command":{"command":"save quiz","type":"quizCreator","data":{"quizSave":{"name":"AP test","description":"ew","tags":[],"ruleBlocks":[{"randomOrder":false,"songCount":100,"guessTime":{"guessTime":20,"extraGuessTime":0},"samplePoint":{"samplePoint":[0,100]},"playBackSpeed":{"playBackSpeed":1},"blocks":[{"connectUp":false,"annSongId":22042}],"duplicates":true,"guessModes":{"song":true,"tinyVideo":false,"blurVideo":false}}],"ruleBlockRandomOrder":true},"quizId":null}}}`;

    console.log("[AP] Generating Quiz #", currentIndex);
    console.log(highScore[currentIndex] ??= [0]);
    const data = JSON.parse(dataTemplate);
    let quizName = gameOptions.quiz_types[currentIndex - 1];
	let quizBlock = data.command.data.quizSave.ruleBlocks[0];

    let songListNew = [];

	//TODO: need to resolve error for songList[currentIndex] returning as undefined
    shuffle(songList[currentIndex]);
	for (let songId of songList[currentIndex]) {
		songListNew.push({
			connectUp: false,
			locked: false,
			annSongId: songId
		});
    }

    if (songListNew === 0) {
        console.error("[AP] Quiz has 0 songs, cannot save");
        sendSystemMessage("Cannot select quiz: The quiz has 0 songs unlocked. Please select another quiz.");
        return;
    }

    data.command.data.quizSave.name = `AP Quiz ${currentIndex || "Final"} [${highScore[currentIndex] || 0} / ${songList[currentIndex]?.length || 0}]`
    quizBlock.songCount = songListNew.length;
    //data.command.data.quizSave.description = name.value + " (" + port.value + ")";
    quizBlock.guessTime.guessTime = gameOptions.guess_time;

    //Apply first trap of queuedTraps to lobby
    if (queuedTraps[0]) { //TODO: modify individual songs instead
        console.log("Applying Trap", queuedTraps[0]);
        let trapList = [];
		let songListIndex = [];
		for (let i = 0; i < 10; i++) {
			songListIndex.push(Math.floor(Math.random() * songListNew.length));
		}
        console.log(songListIndex);
        switch (queuedTraps[0]) {
            case OFFSET.ITEMS.TRAPS + 1 : // generic double speed
				sendSystemMessage("⚠️ Double Speed Trap applied");
				for (let index of songListIndex) {
                    console.log(songListNew[index]);
                    console.log(songListNew[index].annSongId);
                    let trapSong = {
                        connectUp: false,
                        locked: false,
                        annSongId: songListNew[index].annSongId,
                        playBackSpeed: {playBackSpeed: 2}
                    };
					songListNew[index] = trapSong
				}
                break;
            case OFFSET.ITEMS.TRAPS + 2 : // vuhr trap uganda
				sendSystemMessage("⚠️ UGANDA MUSIC QUIZ Trap applied (by: VuhrCulls)");
				trapList = [
					[43186, 24],
					[14098, 22],
					[44810, 23],
					[12367, 22],
					[14188, 57],
					[24691, 45],
					[11773, 11],
					[16603, 47],
					[10381, 0],
					[45175, 19],
					[25676, 67],
					[24033, 56],
					[15893, 52],
					[16490, 0],
					[28711, 56],
					[10854, 56],
					[20298, 52],
					[9738, 12],
					[32243, 50],
					[16102, 28],
					[16774, 67],
					[35213, 11],
					[38971, 22],
					[18952, 13],
					[35325, 14],
					[12077, 23],
					[29842, 37],
					[10271, 45],
					[32561, 23],
					[18943, 69],
					[1706, 68],
					[34905, 59],
					[4162, 58],
					[834, 66],
					[9384, 100],
					[7752, 61],
					[43189, 28],
					[27837, 78],
					[6635, 33],
					[46419, 11],
				];
				// TODO: TEST IF THIS WORKS
				for (let index of songListIndex) {
					let trapIndex = Math.floor(Math.random() * trapList.length);
					songListNew[index] = {
						connectUp: false,
						locked: false,
						annSongId: trapList[trapIndex][0],
						samplePoint: {samplePoint: trapList[trapIndex][1]}
					};
					trapList.splice(trapIndex, 1);
				}
                break;
            case OFFSET.ITEMS.TRAPS + 3 : // fey trap 1 idols
				sendSystemMessage("⚠️ IDOLS WOOOO Trap applied (by: FeyFey)");
				trapList = [12612, 14069, 7490, 12308, 17902, 34476, 36587, 8637, 11473, 14206, 40383, 42812, 15213, 43228, 11452, 13052];
				for (let index of songListIndex) {
					let trapIndex = Math.floor(Math.random() * trapList.length);
					songListNew[index] = {
						connectUp: false,
						locked: false,
						annSongId: trapList[trapIndex]
					};
					trapList.splice(trapIndex, 1);
				}
                break;
            case OFFSET.ITEMS.TRAPS + 4 : // fey trap 2 vn
				sendSystemMessage("⚠️ VN Artists Trap applied (by: FeyFey)");
				trapList = [8967, 20901, 5422, 10941, 6226, 7166, 7282, 27882, 6341, 6342, 7889, 8553, 2195, 2453, 7810, 8885];
				for (let index of songListIndex) {
					let trapIndex = Math.floor(Math.random() * trapList.length);
					songListNew[index] = {
						connectUp: false,
						locked: false,
						annSongId: trapList[trapIndex]
					};
					trapList.splice(trapIndex, 1);
				}
                break;
			case OFFSET.ITEMS.TRAPS + 5 : // generic 2+8s end sample, needs to be fixed
				sendSystemMessage("⚠️ 2+8s End Sample Trap applied");
                for (let index of songListIndex) {
                    let trapSong = {
                        connectUp: false,
                        locked: false,
                        annSongId: songListNew[index].annSongId,
                        samplePoint: {samplePoint: 100},
                        guessTime: {
                            guessTime: 2,
                            extraGuessTime: 8
                        }
                    };
					songListNew[index] = trapSong
				}
                break;
        }
    }

    quizBlock.blocks = songListNew;

    //Update current song list for use with annsongid unique correct checks
    currentList = [];
    for (let song of songListNew) {
        currentList.push(song.annSongId);
    }
    pendingQuizData = data;
    isWaitingForQuizList = true;
    quizListAttempts = 0;
    requestQuizList();
}

function shuffle(array) {
    let m = array.length, t, i;
    while (m) {
        i = Math.floor(Math.random() * m--);

        t = array[m];
        array[m] = array[i];
        array[i] = t;
    }

    return array;
}

function sendSystemMessage(message) {
    if (gameChat && gameChat.systemMessage) {
        setTimeout(() => {
            gameChat.systemMessage(String(message))
        }, 1);
    } else {
        console.log("[AP] System message:", message);
    }
}

function sendGlobalChatMessage(message) {
    socket.sendCommand({
        type: "lobby",
        command: "game chat message",
        data: {msg: String(message), teamMessage: false}
    });
}

function requestQuizList() {
    quizListAttempts++;
    console.log("[AP] Sending quiz list request, attempt:", quizListAttempts);
    socket.sendCommand({
        command: "load builder quizzes",
        type: "quizCreator"
    });

    if (quizListAttempts < 5) {
        setTimeout(() => {
            if (isWaitingForQuizList) {
                console.log("[AP] No response received, retrying...");
                requestQuizList();
            }
        }, 2000);
    } else {
        isWaitingForQuizList = false;
        console.error("[AP] Failed to get quiz list after 5 attempts");
        sendSystemMessage("Failed to load quiz list after multiple attempts");
    }
}

function handleQuizListResponse(payload) {
    console.log("[AP] Received quiz list response:", payload);

    if (!isWaitingForQuizList) {
        console.log("[AP] Ignoring quiz list response (not waiting)");
        return;
    }

    isWaitingForQuizList = false;
    const quizzes = payload.data?.quizzes || payload.quizzes || [];

    console.log("[AP] Total quizzes in list:", quizzes.length);
    console.log("[AP] Quiz names:", quizzes.map(q => q.name));

    // Find existing quiz by exact name match
    const quizName = pendingQuizData?.command?.data?.quizSave?.name;
    let existingQuiz = null;
    if (quizName) {
        existingQuiz = quizzes.find(q => q.name === quizName);

        // If no exact match and the new quiz starts with "AP ",
        // look for ANY quiz starting with "AP " to overwrite to save space
        if (!existingQuiz && quizName.startsWith("AP ")) {
            existingQuiz = quizzes.find(q => q.name.startsWith("AP "));
            if (existingQuiz) {
                console.log("[AP] No exact match, but found another AP quiz to overwrite:", existingQuiz.name);
            }
        }
    }

    if (existingQuiz) {
        console.log("[AP] Found existing quiz:", existingQuiz.name, "ID:", existingQuiz.customQuizId);
        saveQuiz(pendingQuizData, existingQuiz.customQuizId);
    } else {
        console.log("[AP] No existing quiz found, creating new one");
        saveQuiz(pendingQuizData, null);
    }

    pendingQuizData = null;
}

function saveQuiz(data, quizId) {
    console.log("[AP] Saving quiz, existing quiz ID:", quizId);

    const command = JSON.parse(JSON.stringify(data.command));
    const quizName = command.data.quizSave.name;

    if (quizId !== null) {
        command.data.quizId = quizId;
        console.log("[AP] Updating existing quiz with ID:", quizId);
    } else {
        console.log("[AP] Creating new quiz (quizId: null)");
    }

    console.log("[AP] Quiz name:", quizName);
    console.log("[AP] Song blocks count:", command.data.quizSave.ruleBlocks[0].blocks.length);
    console.log("[AP] Full command to send to AMQ:", JSON.stringify(command, null, 2));

    // Temporarily unbind AMQ's quiz save listener to prevent errors when quiz creator UI isn't open
    // AMQ's customQuizCreator.quizSaveListener tries to access modal data that doesn't exist
    // when we save directly without opening the quiz creator UI
    let amqListenerUnbound = false;
    try {
        if (typeof customQuizCreator !== 'undefined' && customQuizCreator.quizSaveListener) {
            customQuizCreator.quizSaveListener.unbindListener();
            amqListenerUnbound = true;
            console.log("[AP] Temporarily unbound AMQ quiz save listener");
        }
    } catch (e) {
        console.warn("[AP] Could not unbind AMQ quiz save listener:", e);
    }

    socket.sendCommand(command);

    console.log("[AP] Save quiz command sent");

    // Rebind AMQ's listener after a short delay to allow our listener to handle the response first
    if (amqListenerUnbound) {
        setTimeout(() => {
            try {
                if (typeof customQuizCreator !== 'undefined' && customQuizCreator.quizSaveListener) {
                    customQuizCreator.quizSaveListener.bindListener();
                    console.log("[AP] Rebound AMQ quiz save listener");
                }
            } catch (e) {
                console.warn("[AP] Could not rebind AMQ quiz save listener:", e);
            }
        }, 5000);
    }
}

function applyQuizToLobby(quizId, quizName) {
    console.log("[AP] Applying quiz to lobby, quiz ID:", quizId, "quiz name:", quizName);

    // Set flag to prevent infinite loop when applying quiz triggers settings change
    isApplyingRoomSettingsQuiz = true;

    console.log("[AP] Sending community mode command...");
    const communityModeCommand = {
        type: "lobby",
        command: "change game settings",
        data: {
            settingChanges: {},
            communityMode: true
        }
    };
    console.log("[AP] Full community mode command:", JSON.stringify(communityModeCommand, null, 2));
    socket.sendCommand(communityModeCommand);

    setTimeout(() => {
        console.log("[AP] Sending select custom quiz command, quiz ID:", quizId);
        const selectQuizCommand = {
            command: "select custom quiz",
            type: "lobby",
            data: {
                quizId: quizId
            }
        };
        console.log("[AP] Full select quiz command:", JSON.stringify(selectQuizCommand, null, 2));
        socket.sendCommand(selectQuizCommand);

        console.log("[AP] Quiz applied");

        // Clear the flag after quiz is applied
        setTimeout(() => {
            isApplyingRoomSettingsQuiz = false;
        }, 100);
    }, 500);
}

function setupListeners() {
    console.log("[AP] Setting up event listeners...");

    new Listener("quiz display custom quiz", (payload) => {
        console.log("[AP] Quiz display custom quiz event received:", payload);
        const quizDesc = payload.data?.quizDescription || payload.quizDescription;
        if (quizDesc) {
            console.log("[AP] Quiz description object:", quizDesc);
            console.log("[AP] Quiz name:", quizDesc.name);
            console.log("[AP] Quiz description:", quizDesc.description);
            console.log("[AP] Quiz creatorName:", quizDesc.creatorName);

            if (quizDesc.name && quizDesc.name.startsWith("AP")) {
                const cleanName = quizDesc.name.startsWith("AP ") ? quizDesc.name.substring(3) : quizDesc.name;
                currentQuizInfo = {
                    name: cleanName,
                    description: quizDesc.description || null,
                    creatorUsername: quizDesc.creatorName || null
                };
                console.log("[AP] Stored quiz info for AP quiz:", currentQuizInfo);
            } else {
                console.log("[AP] Quiz name does not start with 'AP', not storing quiz info. Name:", quizDesc.name);
                currentQuizInfo = null;
            }
        } else {
            console.warn("[AP] No quiz description found in payload");
            currentQuizInfo = null;
        }
    }).bindListener();

    new Listener("quiz end result", (payload) => {
        // Reset quiz fetched flag when quiz ends (allows loading new quiz for next game)
        quizFetchedBeforeGameStart = false;
		// Played through first trap, cycle to next trap in queue
		queuedTraps.shift();
        queuedTraps.push(...heldTraps);
        heldTraps = [];
        save();
        console.log("[AP] Quiz end result, reset quiz fetched flag");
    }).bindListener();

    new Listener("quiz over", (payload) => {
        // Reset quiz fetched flag when quiz ends (allows re-roll for next game)
        quizFetchedBeforeGameStart = false;

        console.log("[AP] Quiz over, reset quiz fetched flag");
        generateCommand();

    }).bindListener();

    new Listener("custom quiz selected", (payload) => {
        console.log("[AP] Custom quiz selected event received:", payload);
        const quizDesc = payload.data?.quizDescription || payload.quizDescription;
        if (quizDesc) {
            selectedCustomQuizId = quizDesc.customQuizId;
            selectedCustomQuizName = quizDesc.name;
            console.log("[AP] Custom quiz selected:", selectedCustomQuizName, "ID:", selectedCustomQuizId);
            console.log("[AP] Full quiz description:", quizDesc);

            if (quizDesc.name && quizDesc.name.startsWith("AP ")) {
                const cleanName = quizDesc.name.startsWith("AP ") ? quizDesc.name.substring(3) : quizDesc.name;
                currentQuizInfo = {
                    name: cleanName,
                    description: quizDesc.description || null,
                    creatorUsername: quizDesc.creatorName || null
                };
                console.log("[AP] Stored quiz info from 'custom quiz selected' event:", currentQuizInfo);
                // Mark that quiz was fetched before game start
                quizFetchedBeforeGameStart = true;
                console.log("[AP] Quiz fetched before game start, flag set");
            } else {
                currentQuizInfo = null;
            }
        } else {
            console.warn("[AP] Custom quiz selected event missing quizDescription:", payload);
            currentQuizInfo = null;
        }
    }).bindListener();

    new Listener("load builder quizzes", (payload) => {
        console.log("[AP] Quiz list loaded event received");
        handleQuizListResponse(payload);
    }).bindListener();

    new Listener("save custom quiz", (payload) => {
        console.log("[AP] Save custom quiz response received:", payload);

        if (payload.success) {
            const newQuizId = payload.quizId;
            const quizName = payload.quizSave?.name || currentQuizData?.command?.data?.quizSave?.name || "Unknown Quiz";
            console.log("[AP] Quiz saved successfully with ID:", newQuizId);

            // Mark that quiz was fetched/saved before game start to prevent re-roll on Start
            quizFetchedBeforeGameStart = true;
            console.log("[AP] Quiz saved before game start, flag set to prevent re-roll");

            const songCount = payload.quizSave?.ruleBlocks?.[0]?.blocks?.length || 0;
            if (songCount > 0) {
                sendSystemMessage(`✅ ${gameOptions.quiz_types[currentIndex - 1] || "Final"} Quiz ready! ${songCount} song${songCount !== 1 ? 's' : ''} loaded. Press Start to begin.`);
            } else { //does this ever happen?
                sendSystemMessage("✅ Quiz ready! Press Start to begin.");
            }

            applyQuizToLobby(newQuizId, quizName);

        } else {
            console.error("[AP] Save quiz command failed:", payload);
            messageDisplayer.displayMessage("Quiz Save Failed", "The quiz failed to save. This is likely due to insufficient community quiz slots (need at least 1). Please delete an old quiz and try again.");
        }
    }).bindListener();

    new Listener("Game Starting", (payload) => {
        // Disable script in restricted modes
        if (shouldDisableScript()) {
            console.log("[AP] Script disabled: Jam, Ranked, or Themed mode detected");
            return;
        }

        if (amqAPEnabled && selectedCustomQuizName && selectedCustomQuizName.startsWith("AMQ+")) {
            console.log("[AP] Game starting");
        }
        currentSongNumber = 0;
        correctCount = 0;
    }).bindListener();

	// TODO: Don't really use chat for commands yet
	// ENDGAME: Make AMQ chat work with archipelago client
    /*
	new Listener("game chat update", (payload) => {
        for (let message of payload.messages) {
            // Check if message is a command
            const msgLower = message.message.toLowerCase();
            if (msgLower.startsWith('/amqap')) {
                // Commands that work locally for everyone (info, sources, dist)
                const localCommands = ['info', 'metadata', 'sources', 'distribution', 'dist'];
                const commandParts = msgLower.split(' ');
                const commandName = commandParts[1];
                const isLocalCommand = localCommands.includes(commandName);

                // Local commands work for everyone, even when not in lobby
                // Always allow local commands from self, regardless of lobby state
                if (isLocalCommand && message.sender === selfName) {
                    handleChatCommand(msgLower);
                    continue;
                }

                // Other commands require lobby and host status
                if (typeof lobby !== 'undefined' && lobby.inLobby) {
                    // Get the sender's game player ID
                    const senderPlayer = Object.values(quiz?.players || {}).find(p => p._name === message.sender);
                    // Check if sender is host: either player object has host flag, or sender is self and lobby says we're host
                    const isHost = senderPlayer?.host === true || (message.sender === selfName && lobby.isHost === true);

                    if (isHost) {
                        handleChatCommand(msgLower);
                    } else if (message.sender === selfName) {
                        // If self but not host, show error
                        sendSystemMessage("⚠️ Only the room host can use AP commands.");
                    }
                } else if (message.sender === selfName) {
                    // If not in lobby but command is from self, try to handle it anyway
                    // This handles edge cases where lobby state might not be properly initialized
                    handleChatCommand(msgLower);
                }
            }
        }
    }).bindListener();

    new Listener("Game Chat Message", (payload) => {
        // Check if message is a command
        const msgLower = payload.message.toLowerCase();
        if (msgLower.startsWith('/amqap') || msgLower === '/1v1debug' || msgLower === '/1v1results') {
            // Commands that work locally for everyone (info, sources, dist)
            const localCommands = ['info', 'metadata', 'sources', 'distribution', 'dist'];
            const commandParts = msgLower.split(' ');
            const commandName = commandParts[1];
            const isLocalCommand = localCommands.includes(commandName);

            // Local commands work for everyone, even when not in lobby
            // Always allow local commands from self, regardless of lobby state
            if (isLocalCommand && payload.sender === selfName) {
                handleChatCommand(msgLower);
                return;
            }

            // Other commands require lobby and host status
            if (typeof lobby !== 'undefined' && lobby.inLobby) {
                // Get the sender's game player ID
                const senderPlayer = Object.values(quiz?.players || {}).find(p => p._name === payload.sender);
                // Check if sender is host: either player object has host flag, or sender is self and lobby says we're host
                const isHost = senderPlayer?.host === true || (payload.sender === selfName && lobby.isHost === true);

                if (isHost) {
                    handleChatCommand(msgLower);
                } else if (payload.sender === selfName) {
                    // If self but not host, show error
                    sendSystemMessage("⚠️ Only the room host can use AP commands.");
                }
            } else if (payload.sender === selfName) {
                // If not in lobby but command is from self, try to handle it anyway
                // This handles edge cases where lobby state might not be properly initialized
                handleChatCommand(msgLower);
            }
        }
    }).bindListener();
	*/

    new Listener("play next song", (payload) => {
        if (payload && payload.songNumber) {
            currentSongNumber = payload.songNumber;
            console.log("[AP] Current song number:", currentSongNumber);
        }
    }).bindListener();

    new Listener("answer results", (data) => {
        if (!amqAPEnabled || !selectedCustomQuizName || !selectedCustomQuizName.startsWith("AP")) {
            return;
        }

        // Only host sends song source messages to global chat
        if (typeof lobby !== 'undefined' && lobby.inLobby && !lobby.isHost) {
            return;
        }

        let isCorrect = quiz.isSpectator ? false : data.players.find(player => player.gamePlayerId === quiz.ownGamePlayerId)?.correct;
        correctCount += isCorrect;
        let currentSongId = currentList[currentSongNumber - 1];

        if (isCorrect && songList[0].includes(currentSongId) && !correctList[currentIndex]?.includes(currentSongId)) {
			if (currentIndex === 0) { //TODO: currently cannot unlock unique songid checks in final quiz
				console.log("[AP] Skipping Unique Correct annSongId Check - Playing Final Quiz");
			} else {
				console.log("[AP] Unique Correct annSongId: [", currentSongId, "]");
				(correctList[currentIndex] ??= []).push(currentSongId);
				try {
					sendCheckIdToAp((OFFSET.LOCATIONS.SONG * currentIndex) + correctList[currentIndex].length);
				} catch (e) {
					console.error("[AP] check did not send");
					correctList[currentIndex].pop();
				}
				save();
			}
        }
        if (correctCount > (highScore[currentIndex] ??= [])) {
            console.log("[AP] New High Score detected [",correctCount, "/",songList[currentIndex].length,"]");
            if (currentIndex === 0) {
                try {
                    sendCheckIdToAp(correctCount + OFFSET.LOCATIONS.FINAL);
                    highScore[currentIndex] = correctCount;
                    localStorage.setItem("highScore", JSON.stringify(highScore));
                    console.log("Current High Score:", highScore[currentIndex]);
                } catch (e) {
                    console.error("[AP] check did not send");
                }
            } else {
                try {
                    sendCheckIdToAp(correctCount + (OFFSET.LOCATIONS.QUIZ * currentIndex));
                    highScore[currentIndex] = correctCount;
                    localStorage.setItem("highScore", JSON.stringify(highScore));
                    console.log("Current High Score:", highScore[currentIndex]);
                } catch (e) {
                    console.error("[AP] check did not send");
                }
            }
        }
    }).bindListener();

    console.log("[AP] Event listeners set up complete");
}

function createHubModalHTML() {
  return `
        <div class="modal fade" id="amqAPHubModal" tabindex="-1" role="dialog">
            <div class="modal-dialog" role="document" style="width: 800px;">
                <div class="modal-content">
                    <div class="modal-header">
                        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                        </button>
                        <h2 class="modal-title">AP Hub</h2>
                    </div>
                    <div class="modal-body" style="display: flex; justify-content: space-around; gap: 20px; padding: 30px;">
                        <!-- AP Quiz Select -->
                        <div id="amqAPQuizSelect" class="gmsModeContainer clickAble" style="flex: 1; position: relative;">
                             <img class="gmsModeImage" src="https://cdn.animemusicquiz.com/v1/ui/game-categories/250px/solo.webp">
                             <div class="gmsModeDescription">
                                 Select AP Quiz Type
                             </div>
                             <div class="gmsModeName">
                                 AP Quiz Select
                             </div>
                             <div class="amqAPHubOverlay" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); flex-direction: column; justify-content: center; align-items: center; gap: 10px; border-radius: 10px; z-index: 10;">
                                 <button class="btn btn-primary amqAPHubQuizBtn Quiz01" style="width: 80%;">${gameOptions.quiz_types[0]} [${highScore[1] || 0} / ${songList[1]?.length || 0}]</button>
                                 <button class="btn btn-primary amqAPHubQuizBtn Quiz02" style="width: 80%;">${gameOptions.quiz_types[1] || "N/A"} [${highScore[2] || 0} / ${songList[2]?.length || 0}]</button>
                                 <button class="btn btn-primary amqAPHubQuizBtn Quiz03" style="width: 80%;">${gameOptions.quiz_types[2] || "N/A"} [${highScore[3] || 0} / ${songList[3]?.length || 0}]</button>
                                 <button class="btn btn-primary amqAPHubQuizBtn Quiz04" style="width: 80%;">${gameOptions.quiz_types[3] || "N/A"} [${highScore[4] || 0} / ${songList[4]?.length || 0}]</button>
                                 <button class="btn btn-primary amqAPHubQuizBtn Quiz05" style="width: 80%;">${gameOptions.quiz_types[4] || "N/A"} [${highScore[5] || 0} / ${songList[5]?.length || 0}]</button>
                                 <button class="btn btn-primary amqAPHubQuizBtn Quiz06" style="width: 80%;">${gameOptions.quiz_types[5] || "N/A"} [${highScore[6] || 0} / ${songList[6]?.length || 0}]</button>
                                 <button class="btn btn-primary amqAPHubQuizBtn Quiz07" style="width: 80%;">${gameOptions.quiz_types[6] || "N/A"} [${highScore[7] || 0} / ${songList[7]?.length || 0}]</button>
                                 <button class="btn btn-primary amqAPHubQuizBtn Quiz08" style="width: 80%;">${gameOptions.quiz_types[7] || "N/A"} [${highScore[8] || 0} / ${songList[8]?.length || 0}]</button>
                                 <button class="btn btn-primary amqAPHubQuizBtn Quiz09" style="width: 80%;">${gameOptions.quiz_types[8] || "N/A"} [${highScore[9] || 0} / ${songList[9]?.length || 0}]</button>
                                 <button class="btn btn-primary amqAPHubQuizBtn Quiz10" style="width: 80%;">${gameOptions.quiz_types[9] || "N/A"} [${highScore[10] || 0} / ${songList[10]?.length || 0}]</button>
                                 <button class="btn btn-sm btn-danger amqAPHubBackBtn" style="margin-top: 10px;">Back</button>
                             </div>
                        </div>

                        <!-- Final Quiz -->
                        <div id="amqAPHubFinalQuiz" class="gmsModeContainer clickAble" style="flex: 1;" data-dismiss="modal">
                             <img class="gmsModeImage" src="https://cdn.animemusicquiz.com/v1/ui/game-categories/250px/nexus.webp">
                             <div class="gmsModeDescription">
                                 Load Final Quiz, unlocked after clearing every quiz type
                             </div>
                             <div id="amqAPHubFinalQuizName" class="gmsModeName">
                                 Final Quiz (${finalQuizEnabled}) [${highScore[0] || 0} / ${songList[0]?.length || 0}]
                             </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <div style="float: left;">
                             <button type="button" class="btn btn-danger" id="amqAPHubDisableBtn">Disable AMQ AP</button>
                        </div>
                        <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function createUI() {
    console.log("[AP] Creating UI elements...");

    if ($("#amqAPToggle").length > 0) {
        console.log("[AP] Toggle button already exists, skipping creation");
        return;
    }

    // Add AP button (Hub entry)
    $("#lobbyPage .topMenuBar").append(`<div id="amqAPToggle" class="clickAble topMenuButton topMenuMediumButton"><h3>AP AMQ</h3></div>`);
    $("#amqAPToggle").click(() => {
        console.log("[AP] AP button clicked");

        // Only allow host to open AMQ+ hub
        if (typeof lobby !== 'undefined' && lobby.inLobby && !lobby.isHost) {
            sendSystemMessage("⚠️ Only the room host can enable or configure AP.");
            return;
        }

        console.log("[AP] Opening Hub (user is host or not in lobby)");
        updateQuizButtons();
		$("#amqAPHubModal").modal("show");
    });

    updateToggleButton();
    applyStyles();

	const hubModal = $(createHubModalHTML());

	const gameContainer = $("#gameContainer");
	const targetContainer = gameContainer.length > 0 ? gameContainer : $("body");

	// Append Hub modal
	if ($("#amqAPHubModal").length === 0) {
		targetContainer.append(hubModal);
		console.log("[AP] Hub modal appended");
		attachHubHandlers();
	}
}

function attachHubHandlers() {
	// Final Quiz Select - Load Final Quiz
	$("#amqAPHubFinalQuiz").click(() => {
		console.log("[AP Hub] Final Quiz selected");

		// Only host can enable AMQ AP
		if (typeof lobby !== 'undefined' && lobby.inLobby && !lobby.isHost) {
			sendSystemMessage("⚠️ Only the room host can enable or configure AMQ AP.");
			$("#amqAPHubModal").modal("hide");
			return;
		}

        //TODO: check for quiz clear items
        if (finalQuizEnabled === "Locked") {
            sendSystemMessage("⚠️ Final quiz locked, clear all other quizzes to unlock");
            $("#amqAPHubModal").modal("hide");
            return;
        }

		amqAPEnabled = true;
		currentIndex = 0;
		updateToggleButton();
		generateCommand();

	});

	// Quiz Select - Show Overlay
	$("#amqAPQuizSelect").click(function (e) {
		//Ignore clicks inside overlay
		if ($(e.target).closest('.amqAPHubOverlay').length) return;

		$(".amqAPHubOverlay").hide();
		$(this).find(".amqAPHubOverlay").css("display", "flex");
	});

	// Back Buttons in Overlay
	$(document).on('click', '.amqAPHubBackBtn', function (e) {
		e.stopPropagation();
		$(".amqAPHubOverlay").hide();
	});

	//Quiz Button Select - Load Quiz
	$(document).on('click', '.amqAPHubQuizBtn', function (e) {
		e.stopPropagation();

		// Only host can enable AMQ AP
		if (typeof lobby !== 'undefined' && lobby.inLobby && !lobby.isHost) {
			sendSystemMessage("⚠️ Only the room host can enable or configure AMQ AP.");
			$("#amqAPHubModal").modal("hide");
			return;
		}

		$("#amqAPHubModal").modal("hide");

		console.log("[AP] Quiz Select Button Pressed");

		amqAPEnabled = true;
        console.log(e.target.className.slice(-2));
		currentIndex = Number(e.target.className.slice(-2));
        e.target.textContent = 'wow that worked here first';
        updateQuizButtons();
		updateToggleButton();
		generateCommand();
	});

	// Disable AMQ AP Button handler
	$("#amqAPHubDisableBtn").click(function () {
		console.log("[AP Hub] Disable AMQ AP clicked");

		// Only host can disable AMQ AP
	    if (typeof lobby !== 'undefined' && lobby.inLobby && !lobby.isHost) {
			sendSystemMessage("⚠️ Only the room host can enable or configure AMQ+.");
			$("#amqPlusHubModal").modal("hide");
			return;
		}

		amqAPEnabled = false;
		updateToggleButton();
		sendSystemMessage("AMQ AP mode disabled");
		$("#amqAPHubModal").modal("hide");
	});
}

function updateToggleButton() {
    console.log("[AP] Updating toggle button, enabled:", amqAPEnabled);

    // Disable AP if in restricted modes
    if (shouldDisableScript()) {
        amqAPEnabled = false;
        console.log("[AP] AP disabled due to restricted mode (Jam/Ranked/Themed)");
    }

    if (amqAPEnabled) {
        $("#amqAPToggle").css({
            "background-color": "rgba(46, 125, 50, 1)",
            "border": "1px solid rgba(46, 125, 50, 1)"
        });
        console.log("[AP] Toggle button color set to subtle green");
    } else {
        $("#amqAPToggle").css({
            "background-color": "",
            "border": ""
        });
        console.log("[AP] Toggle button color reset");
    }
}

function updateQuizButtons() {
	console.log("[AP] Updating quiz buttons");

    //Final Quiz Unlock
    if (finalQuizEnabled === "Locked" && clearItems?.length >= gameOptions.quiz_types.length) {
        finalQuizEnabled = "Unlocked";
        sendSystemMessage("Final Quiz Unlocked!!");
    }

    const button = document.querySelectorAll('.amqAPHubQuizBtn');
    button.forEach (function(button, index) {
        button.textContent = `${gameOptions.quiz_types[index] || "N/A"} [${highScore[index + 1] || 0} / ${songList[index + 1]?.length || 0}]`
    });
    document.getElementById('amqAPHubFinalQuizName').textContent = `Final Quiz (${finalQuizEnabled}) [${highScore[0] || 0} / ${songList[0]?.length || 0}]`
}

function applyStyles() {
    $("#amqAPStyle").remove();
    let style = document.createElement("style");
    style.type = "text/css";
    style.id = "amqAPStyle";
    let text = `
        #amqAPToggle {
            position: absolute;
            right: calc(50% + 160px);
            width: 100px;
        }
    `;
    style.appendChild(document.createTextNode(text));
    document.head.appendChild(style);
}
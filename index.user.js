// ==UserScript==
// @name        Download CCLI ChordPro for PlanningCenter
// @namespace   Violentmonkey Scripts
// @match       https://songselect.ccli.com/*
// @grant       GM_setClipboard
// @version     v1.0.0
// @author      aux
// @description 3/28/2025, 5:07:30 PM
// ==/UserScript==

class IntegerParser {
  /**
   * Parses a valid finite integer from a string
   * @param {string} value a string representing an integer
   * @returns the string converted to an integer
   */
  static parse(value) {
    const numberValue = parseFloat(value);

    const isValid = !isNaN(numberValue) && isFinite(value);
    if (!isValid || parseInt(numberValue) !== numberValue) {
      throw new Error(`Given value ${value} is not a valid finite integer`);
    }

    return numberValue;
  }
}

class SongFinder {
  static EXPECTED_PART_COUNT = 5;
  static PATHNAME_SEPARATOR = "/";

  static async getSongDetails() {
    const songId = SongFinder.getSongId();
    const defaultKey = DefaultKeyFinder.find();
  
    return new SongDetails(songId, defaultKey);
  }

  static getSongId() {
    const rawId = SongFinder.getRawSongId();
  
    return IntegerParser.parse(rawId);
  }

  static getRawSongId() { 
    const parts = location.pathname.split(SongFinder.PATHNAME_SEPARATOR);
    if (parts.length !== SongFinder.EXPECTED_PART_COUNT) {
      throw new Error(`Actual pathname part count ${parts.length} does not match expected part count of ${SongFinder.EXPECTED_PART_COUNT}`);
    }
  
    return parts[2];
  }
}

class DefaultKeyFinder {
  static SELECTOR = `select[id="ChordSheetTransposeKeySelectInput"]`;
  static EXPECTED_TEXT = "(Default)";

  /**
   * Attempts to find the default key of the song that is currently opened
   * @returns {string} the default key of the currently opened song
   */
  static find() {
    const keySelector = document.querySelector(DefaultKeyFinder.SELECTOR);
    if (!keySelector) {
      console.warn("Could not find the key selector");
      return;
    }
  
    const allOptions = keySelector.querySelectorAll("option");
    const defaultKey = [...allOptions].find(DefaultKeyFinder.isDefaultKey)?.value;
    if (defaultKey === undefined) {
      throw new Error("Could not find the default key on the page");
    }
  
    return defaultKey;
  }

  /**
   * Checks if a key option is the default key option.
   * @param {HTMLOptionElement} option 
   * @returns true if the current key option is the default key option
   */
  static isDefaultKey(option) {
    return option.textContent.includes(DefaultKeyFinder.EXPECTED_TEXT);
  }
}

class SongDetails {
  /**
   * The CCLI id of a song
   * @type {number}
   */
  id;

  /**
   * The default key of a song
   * @type {string}
   */
  key;

  constructor(id, key) {
    this.id = id;
    this.key = key;
  }
}

class ChordProParser {
  static SECTION_DELIMITER_PATTERN = /\r?\n\r?\n/;
  static SECTION_DELIMITER = "\n\n";

  static parse(chordProText) {
    // Split the text into sections based on double newlines
    const sections = chordProText.split(ChordProParser.SECTION_DELIMITER_PATTERN);

    // Remove copyright from the sections (PlanningCenter includes these)
    const modifiedSections = sections.slice(1, -1);
    const songText = modifiedSections.join(ChordProParser.SECTION_DELIMITER);

    // Converts section headers to PlanningCenter's format
    const formattedComments = songText.replace(/\{comment: (.*?)\}/g, "<b>$1</b>\n");

    // Ensure spacing between adjacent chord brackets
    const consistentSpacing = formattedComments.replaceAll("][", "] [").replaceAll("](", "] (");

    // Remove any redundant whitespace from the beginning or end of the chords
    return consistentSpacing.trim();
  }
}

class ChordProAPI {
  static BASE_URL = "https://songselect.ccli.com/api";
  static CHORD_NOTATION = "Standard";
  static CHORD_COLUMNS = 1;

  /**
   * Fetches the contents of the ChordPro file from SongSelect
   * @param {SongDetails} songDetails 
   * @returns {Promise<string>} the ChordPro file content
   */
  static async fetchChordProText(songDetails) {
    const url = ChordProAPI.buildURL(songDetails);
    const res = await fetch(url);
    const data = await res.json();
  
    const payload = data.payload;
    if (payload === undefined || payload === "") {
      throw new Error(`Missing Chord Pro payload in response data: ${data}`);
    }
  
    return payload.trimStart();
  }

  /**
   * Builds the Chord Pro API URL
   * @param {SongDetails} songDetails 
   * @returns 
   */
  static buildURL(songDetails) {
    const parameters = ChordProAPI.createURLParameters(songDetails);
    return `${ChordProAPI.BASE_URL}/GetSongChordPro?${parameters.toString()}`;
  }

  /**
   * Creates URL Search Parameters from song details
   * @param {SongDetails} songDetails 
   * @returns {URLSearchParams}
   */
  static createURLParameters(songDetails) {
    const parameters = {
      songNumber: songDetails.id,
      key: songDetails.key,
      style: ChordProAPI.CHORD_NOTATION,
      columns: ChordProAPI.CHORD_COLUMNS,
    };

    return new URLSearchParams(parameters);
  }
}

class App {
  /**
   * Used to store songs that have already been downloaded - to prevent the script from unnecessarily calling the API
   * @type {number[]}
   */
  downloadHistory;

  /**
   * Number of ms between checks whether the script should run
   */
  static INTERVAL_DELAY = 1000;

  constructor() {
    this.downloadHistory = [];
  }

  run() {
    setInterval(() => this.main(), App.INTERVAL_DELAY);

    this.main();
  }

  async main() {
    if (!this.isCorrectPage()) {
      console.debug("Incorrect page!");
      return;
    }
  
    const songDetails = await SongFinder.getSongDetails();
  
    if (this.downloadHistory.includes(songDetails.id)) {
      console.debug("Song has already been downloaded!");
      return;
    }

    console.info(`Song details: ${JSON.stringify(songDetails)}`);
    this.downloadHistory.push(songDetails.id);
  
    const chordProText = await ChordProAPI.fetchChordProText(songDetails);
    console.info(`Chord pro text:\n${chordProText}`);
  
    const result = ChordProParser.parse(chordProText);
    console.info(`Planning Center version:\n${result}`);
  
    alert("Saving the ChordPro file to your clipboard!");
    GM_setClipboard(result);
  }

  isCorrectPage() {
    const pathname = location.pathname;
    const startsWithSongs = pathname.startsWith("/songs");
    const endsOnChordSheet = pathname.endsWith("/viewchordsheet");

    return startsWithSongs && endsOnChordSheet;
  }
}

const app = new App();
app.run();
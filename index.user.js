// ==UserScript==
// @name        Download CCLI ChordPro for PlanningCenter
// @namespace   Violentmonkey Scripts
// @match       https://songselect.ccli.com/*
// @match       https://services.planningcenteronline.com/*
// @grant       GM_setClipboard
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_xmlhttpRequest
// @grant       GM_registerMenuCommand
// @version     1.0.0
// @author      aux
// @downloadURL https://github.com/Auxority/ccli-chordpro-to-planning-center/raw/refs/heads/main/index.user.js
// @updateURL https://github.com/Auxority/ccli-chordpro-to-planning-center/raw/refs/heads/main/index.user.js
// ==/UserScript==

// TODO: Check if song already exists in PC using CCLI ID.
// If not, pull in all info about the song (ID, ChordPro, Default Key, Tempo, etc.)
// Then add it the song to PC.

// TODO: If authentication fails we could automatically attempt to refresh the token.

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

    // Converts section headers to PlanningCenter"s format
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

class TokenStorage {
  static saveToken(tokenData) {
    GM_setValue("access_token", tokenData.access_token);
    GM_setValue("refresh_token", tokenData.refresh_token);
    GM_setValue("expires_at", Date.now() + tokenData.expires_in * 1000);
  }

  static get accessToken() {
    return GM_getValue("access_token", null);
  }

  static get refreshToken() {
    return GM_getValue("refresh_token", null);
  }

  static get isTokenValid() {
    const expiresAt = Number(GM_getValue("expires_at", 0));
    return Date.now() < expiresAt;
  }

  static get clientId() {
    return GM_getValue("client_id", null);
  }

  static get clientSecret() {
    return GM_getValue("client_secret", null);
  }

  static async promptForCredentials() {
    const id = prompt("Enter your Planning Center CLIENT ID:");
    const secret = prompt("Enter your Planning Center CLIENT SECRET:");
    if (id && secret) {
      GM_setValue("client_id", id.trim());
      GM_setValue("client_secret", secret.trim());
      alert("✅ Credentials saved.");
    } else {
      alert("❌ Client ID and secret are required.");
    }
  }

  static get hasCredentials() {
    return this.clientId && this.clientSecret;
  }
}

class OAuthClient {
  static CONFIG = {
    REDIRECT_URI: "https://services.planningcenteronline.com/dashboard/0",
    AUTH_URL: "https://api.planningcenteronline.com/oauth/authorize",
    TOKEN_URL: "https://api.planningcenteronline.com/oauth/token",
    SCOPE: "people",
  };

  constructor() {
  }

  getAuthUrl() {
    const state = Math.random().toString(36).substring(2);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: TokenStorage.clientId,
      redirect_uri: OAuthClient.CONFIG.REDIRECT_URI,
      scope: OAuthClient.CONFIG.SCOPE,
      state,
    });

    return `${OAuthClient.CONFIG.AUTH_URL}?${params.toString()}`;
  }

  exchangeCodeForToken(code) {
    const authHeader = btoa(`${TokenStorage.clientId}:${TokenStorage.clientSecret}`);

    GM_xmlhttpRequest({
      method: "POST",
      url: OAuthClient.CONFIG.TOKEN_URL,
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: OAuthClient.CONFIG.REDIRECT_URI,
      }).toString(),
      onload: (response) => {
        if (response.status === 200) {
          const result = JSON.parse(response.responseText);
          TokenStorage.saveToken(result);

          if (window.opener) {
            window.opener.postMessage({
              type: "oauth_complete",
              access_token: result.access_token,
              refresh_token: result.refresh_token,
              expires_in: result.expires_in
            }, "*");
            window.close();
          } else {
            alert("✅ Access token received - but not really.");
          }
        } else {
          console.error("Token exchange error:", response);
          alert("Failed to get access token.");
        }
      },
      onerror: (err) => {
        console.error("Request failed:", err);
      }
    });
  }

  refreshAccessToken() {
    const authHeader = btoa(`${TokenStorage.clientId}:${TokenStorage.clientSecret}`);
    console.info("🔄 Attempting to refresh token...");

    GM_xmlhttpRequest({
      method: "POST",
      url: this.config.TOKEN_URL,
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: TokenStorage.refreshToken,
      }).toString(),
      onload: (response) => this.handleRefreshResponse(response),
      onerror: (err) => {
        console.error("Refresh request failed:", err);
      }
    });
  }

  handleRefreshResponse(response) {
    if (response.status === 200) {
      const result = JSON.parse(response.responseText);
      TokenStorage.saveToken(result);
      console.info("✅ Token refreshed successfully.");
    } else {
      console.error("🔁 Token refresh failed:", response);
      alert("Refresh token is invalid or expired. Please log in again.");
    }
  }
}

class OAuthFlow {
  constructor() {
    this.client = new OAuthClient();
  }

  async init() {
    if (!TokenStorage.hasCredentials) {
      await TokenStorage.promptForCredentials();
    }

    console.debug(`Window location: ${window.location.href}`);

    if (window.location.href.startsWith(OAuthClient.CONFIG.REDIRECT_URI)) {
      this._handleRedirect();
    } else {
      this._setupMessageListener();
      this._checkTokenStatus();
      GM_registerMenuCommand("🔐 Log In to Planning Center", () => this.startLogin());
      GM_registerMenuCommand("⚙️  Set API Credentials", () => TokenStorage.promptForCredentials());
    }
  }

  startLogin() {
    const authUrl = this.client.getAuthUrl();
    const popup = window.open(authUrl, "oauthPopup", "width=500,height=700,menubar=no,location=no,resizable=yes,scrollbars=yes,status=no");
    if (!popup || popup.closed || typeof popup.closed === "undefined") {
      console.error(`Popup blocked! Please allow popups for this site.`);
      alert("Popup blocked! Please allow popups for this site.");
    }
  }

  _handleRedirect() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code) {
      console.debug("Authorization code detected:", code);
      this.client.exchangeCodeForToken(code);
    }
  }

  _setupMessageListener() {
    window.addEventListener("message", (event) => {
      if (event.data?.type === "oauth_complete" && event.data.access_token) {
        TokenStorage.saveToken(event.data);
        console.debug(event.data);
        alert("✅ Token received and stored.");
      }
    });
  }

  _checkTokenStatus() {
    console.debug(`Current access token: ${TokenStorage.accessToken}`);
    if (TokenStorage.accessToken) {
      if (TokenStorage.isTokenValid) {
        console.info("✅ Access token is valid and ready.");
      } else if (TokenStorage.refreshToken) {
        this.client.refreshAccessToken();
      } else {
        console.warn("⚠️ Token expired and no refresh token found. Please log in again.");
      }
    } else {
      console.info("🔐 No access token found. Use menu to authenticate.");
    }
  }
}

class App {
  /**
   * Used to store songs that have already been downloaded - to prevent the script from unnecessarily calling the API
   * @type {number[]}
   */
  downloadHistory;

  /**
   * Used to handle PlanningCenter's OAuth2 flow.
   */
  authFlow;

  /**
   * Number of ms between checks whether the script should run
   */
  static INTERVAL_DELAY = 1000;

  constructor() {
    this.downloadHistory = [];
    this.authFlow = new OAuthFlow(this.client);
  }

  run() {
    setInterval(() => this.init(), App.INTERVAL_DELAY);

    this.init();
  }

  async init() {
    if (!this.isCorrectPage()) {
      console.debug("Incorrect page!");
      return;
    }

    this.authFlow.init();

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

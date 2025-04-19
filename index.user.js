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
// @version     0.1.0
// @author      aux
// @downloadURL https://github.com/Auxority/ccli-songselect-to-planning-center/raw/refs/heads/main/index.user.js
// @updateURL https://github.com/Auxority/ccli-songselect-to-planning-center/raw/refs/heads/main/index.user.js
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
  static EXPECTED_PART_COUNT = 4;
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

class GMRequest {
  /**
   * Sends a GM_xmlhttpRequest and returns a Promise.
   * @param {Object} options - Same options as GM_xmlhttpRequest.
   * @returns {Promise<Object>} - Resolves with the response or rejects on error.
   */
  static send(options) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        ...options,
        onload: (response) => {
          if (response.status >= 200 && response.status < 300) {
            resolve(response);
          } else {
            reject(response);
          }
        },
        onerror: reject,
        ontimeout: reject,
      });
    });
  }
}

class OAuthClient {
  static CONFIG = {
    REDIRECT_URI: "https://services.planningcenteronline.com/dashboard/0",
    AUTH_URL: "https://api.planningcenteronline.com/oauth/authorize",
    TOKEN_URL: "https://api.planningcenteronline.com/oauth/token",
    SCOPE: "services",
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

  async exchangeCodeForToken(code) {
    const authHeader = btoa(`${TokenStorage.clientId}:${TokenStorage.clientSecret}`);

    const response = await GMRequest.send({
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
    }).catch(err => {
      alert("Failed to get access token.");
      throw new Error("Token exchange error:", err);
    });

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
    }
  }

  async refreshAccessToken() {
    const authHeader = btoa(`${TokenStorage.clientId}:${TokenStorage.clientSecret}`);
    console.info("🔄 Attempting to refresh token...");

    const response = await GMRequest.send({
      method: "POST",
      url: OAuthClient.CONFIG.TOKEN_URL,
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: TokenStorage.refreshToken,
      }).toString(),
    }).catch(err => {
      console.error("🔁 Token refresh failed:", response);
      alert("Refresh token is invalid or expired. Please log in again.");
      throw new Error("Refresh request failed:", err);
    });

    this.onSuccessfulRefreshResponse(response);
  }

  onSuccessfulRefreshResponse(response) {
    const result = JSON.parse(response.responseText);
    TokenStorage.saveToken(result);
    console.info("✅ Token refreshed successfully.");
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
    } else {
      console.warn("Could not find authorization code!");
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
      alert("🔐 No access token found. Please use the menu to login.");
    }
  }
}

class SongSelectService {
  static async fetchSongDetails(songId, slug) {
    const res = await fetch(`https://songselect.ccli.com/api/GetSongDetails?songNumber=${songId}&slug=${slug}`);
    const json = await res.json();
    return json.payload || {};
  }

  static extractArrangementKey(payload) {
    return Array.isArray(payload.defaultKey) && payload.defaultKey.length > 0
      ? payload.defaultKey[0]
      : "C";
  }

  static extractTitle(payload) {
    return payload.title || "";
  }

  static extractAdmin(payload) {
    return Array.isArray(payload.administrators) ? payload.administrators.join(", ") : "";
  }

  static extractAuthor(payload) {
    return Array.isArray(payload.authors)
      ? payload.authors.map(a => typeof a === "string" ? a : a.label).join(", ")
      : "";
  }

  static extractCopyright(payload) {
    return payload.copyrights || "";
  }

  static extractThemes(payload) {
    return Array.isArray(payload.themes)
      ? payload.themes.map(t => typeof t === "string" ? t : t.label)
      : [];
  }
}

class PlanningCenterService {
  static BASE_URL = "https://api.planningcenteronline.com/services/v2";

  static defaultHeaders(extra = {}) {
    return {
      "Authorization": `Bearer ${TokenStorage.accessToken}`,
      "Content-Type": "application/json",
      ...extra
    };
  }

  static async findSongByCcli(songId) {
    const response = await GMRequest.send({
      method: "GET",
      url: `${this.BASE_URL}/songs?where[ccli_number]=${songId}`,
      headers: this.defaultHeaders(),
    });
    const json = JSON.parse(response.responseText);
    return (json.data && json.data.length > 0) ? json.data[0] : null;
  }

  static async createSong(songId, payload) {
    const songPayload = {
      data: {
        type: "Song",
        attributes: {
          title: SongSelectService.extractTitle(payload),
          admin: SongSelectService.extractAdmin(payload),
          author: SongSelectService.extractAuthor(payload),
          copyright: SongSelectService.extractCopyright(payload),
          ccli_number: songId,
          hidden: false,
          themes: SongSelectService.extractThemes(payload)
        }
      }
    };
    const response = await GMRequest.send({
      method: "POST",
      url: `${this.BASE_URL}/songs`,
      headers: this.defaultHeaders(),
      data: JSON.stringify(songPayload),
    });
    return JSON.parse(response.responseText).data;
  }

  static async getArrangements(songApiId) {
    const response = await GMRequest.send({
      method: "GET",
      url: `${this.BASE_URL}/songs/${songApiId}/arrangements`,
      headers: this.defaultHeaders(),
    });
    const json = JSON.parse(response.responseText);
    return json.data || [];
  }

  static async patchArrangement(songApiId, arrangementId, arrangementKey, chordPro, bpm = null, lyricsEnabled = true) {
    const arrangementPayload = {
      data: {
        type: "Arrangement",
        attributes: {
          chord_chart_key: arrangementKey,
          lyrics_enabled: lyricsEnabled,
          chord_chart: chordPro,
          ...(bpm ? { bpm } : {})
        }
      }
    };
    const response = await GMRequest.send({
      method: "PATCH",
      url: `${this.BASE_URL}/songs/${songApiId}/arrangements/${arrangementId}`,
      headers: this.defaultHeaders(),
      data: JSON.stringify(arrangementPayload),
    });
    return JSON.parse(response.responseText);
  }

  static async createArrangement(songApiId, arrangementKey, chordPro, bpm = null, lyricsEnabled = true) {
    const arrangementPayload = {
      data: {
        type: "Arrangement",
        attributes: {
          name: "Default Arrangement",
          chord_chart_key: arrangementKey,
          lyrics_enabled: lyricsEnabled,
          chord_chart: chordPro,
          ...(bpm ? { bpm } : {})
        }
      }
    };
    const response = await GMRequest.send({
      method: "POST",
      url: `${this.BASE_URL}/songs/${songApiId}/arrangements`,
      headers: this.defaultHeaders(),
      data: JSON.stringify(arrangementPayload),
    });
    return JSON.parse(response.responseText);
  }

  static async setArrangementKeys(songApiId, arrangementId, startingKey, endingKey = null, name = "Default", alternateKeys = []) {
    const keysPayload = {
      data: {
        type: "Key",
        attributes: {
          name,
          starting_key: startingKey,
          // Only include ending_key and alternate_keys if provided
          ...(endingKey ? { ending_key: endingKey } : {}),
          ...(alternateKeys.length > 0 ? { alternate_keys: alternateKeys } : {})
        }
      }
    };
    const response = await GMRequest.send({
      method: "POST",
      url: `${this.BASE_URL}/songs/${songApiId}/arrangements/${arrangementId}/keys`,
      headers: this.defaultHeaders(),
      data: JSON.stringify(keysPayload),
    });
    return JSON.parse(response.responseText);
  }
}

class App {
  /**
   * Used to handle PlanningCenter's OAuth2 flow.
   */
  authFlow;

  constructor() {
    this.authFlow = new OAuthFlow(this.client);
  }

  run() {
    // Only set up menu commands, do not auto-run main logic
    this.authFlow.init();
    GM_registerMenuCommand("⬇️ Import Song to Planning Center", () => this.importSongToPlanningCenter());
  }

  async importSongToPlanningCenter() {
    if (!this.isCorrectPage()) {
      alert("Not on a SongSelect song page!");
      return;
    }

    if (!TokenStorage.isTokenValid) {
      alert("You must be logged in to Planning Center first.");
      return;
    }

    const songId = SongFinder.getSongId();
    let song = await PlanningCenterService.findSongByCcli(songId);

    // Always fetch SongSelect details for arrangement step
    const slug = location.pathname.split("/").pop();
    const payload = await SongSelectService.fetchSongDetails(songId, slug);
    const arrangementKey = SongSelectService.extractArrangementKey(payload);
    const title = SongSelectService.extractTitle(payload);
    const bpm = payload.bpm && !isNaN(Number(payload.bpm)) ? Number(payload.bpm) : null;

    let songApiId;
    if (!song) {
      const createdSong = await PlanningCenterService.createSong(songId, payload);
      songApiId = createdSong.id;
      console.info("✅ Song added to Planning Center!");
    } else {
      songApiId = song.id;
      alert("❌ This song already exists in Planning Center!");
      return;
    }

    const songDetails = new SongDetails(songId, arrangementKey);
    let chordProText;
    try {
      chordProText = await ChordProAPI.fetchChordProText(songDetails);
    } catch (e) {
      alert("❌ This song does not have a ChordPro file available on CCLI.");
      return;
    }
    if (!chordProText || chordProText.trim() === "") {
      alert("❌ This song does not have a ChordPro file available on CCLI.");
      return;
    }
    const chordPro = ChordProParser.parse(chordProText);

    try {
      const arrangements = await PlanningCenterService.getArrangements(songApiId);
      let arrangementId;
      if (arrangements.length > 0) {
        arrangementId = arrangements[0].id;
        await PlanningCenterService.patchArrangement(
          songApiId,
          arrangementId,
          arrangementKey,
          chordPro,
          bpm
        );
        alert("✅ Arrangement updated in Planning Center!");
      } else {
        const createdArrangement = await PlanningCenterService.createArrangement(
          songApiId,
          arrangementKey,
          chordPro,
          bpm
        );
        arrangementId = createdArrangement.data?.id;
        alert("✅ Arrangement added to Planning Center!");
      }

      // Set the default key for the arrangement using the keys endpoint
      if (arrangementId && arrangementKey) {
        console.info("Adding default key set for arrangement:", arrangementKey);
        await PlanningCenterService.setArrangementKeys(
          songApiId,
          arrangementId,
          arrangementKey,
        ).catch(err => {
          console.error("Failed to set arrangement keys:", err);
        });
      }
    } catch (e) {
      console.error("Arrangement step failed:", e);
    }
  }

  isCorrectPage() {
    const pathname = location.pathname;
    const startsWithSongs = pathname.startsWith("/songs");

    return startsWithSongs;
  }
}

const app = new App();
app.run();

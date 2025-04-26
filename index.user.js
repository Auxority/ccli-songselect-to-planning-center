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
// @version     0.5.0
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
  parse(value) {
    const numberValue = parseFloat(value);

    const isValid = !isNaN(numberValue) && isFinite(value);
    if (!isValid || parseInt(numberValue) !== numberValue) {
      throw new TypeError(`Given value ${value} is not a valid finite integer`);
    }

    return numberValue;
  }
}

class SongFinder {
  static EXPECTED_PART_COUNT = 4;
  static PATHNAME_SEPARATOR = "/";

  constructor() {
    this.integerParser = new IntegerParser();
  }

  getSongId() {
    const rawId = this.getRawSongId();
    return this.integerParser.parse(rawId);
  }

  getRawSongId() {
    const parts = location.pathname.split(SongFinder.PATHNAME_SEPARATOR);
    if (parts.length !== SongFinder.EXPECTED_PART_COUNT) {
      throw new Error(`Actual pathname part count ${parts.length} does not match expected part count of ${SongFinder.EXPECTED_PART_COUNT}`);
    }

    return parts[2];
  }
}

class ChordProResponse {
  static SECTION_DELIMITER_PATTERN = /\r?\n\r?\n/;
  static SECTION_DELIMITER = "\n\n";

  constructor(rawText) {
    this.rawText = rawText;
  }

  toPlanningCenter() {
    // Split the text into sections based on double newlines
    const sections = this.rawText.split(ChordProResponse.SECTION_DELIMITER_PATTERN);

    // Remove copyright from the sections (PlanningCenter includes these)
    const modifiedSections = sections.slice(1, -1);
    const songText = modifiedSections.join(ChordProResponse.SECTION_DELIMITER);

    // Converts section headers to PlanningCenter"s format
    const formattedComments = songText.replace(/\{comment: (.*?)\}/g, "<b>$1</b>\n");

    // Ensure spacing between adjacent chord brackets
    const consistentSpacing = formattedComments.replaceAll("][", "] [").replaceAll("](", "] (");

    // Remove any redundant whitespace from the beginning or end of the chords
    return consistentSpacing.trim();
  }
}

class SongSelectAPI {
  static BASE_URL = "https://songselect.ccli.com/api";
  static CHORD_NOTATION = "Standard";
  static CHORD_COLUMNS = 1;

  constructor() {
  }

  /**
   * Fetches and parses the song details from CCLI SongSelect
   * @param {number} songId the CCLI ID of the song 
   * @param {string} slug end of the url on the song page 
   * @returns {Promise<SongDetails>} the song details
   */
  async fetchSongDetails(songId, slug) {
    const url = `${SongSelectAPI.BASE_URL}/GetSongDetails?songNumber=${songId}&slug=${slug}`;
    const res = await fetch(url);
    const json = await res.json();
    return SongDetails.deserialize(json.payload);
  }

  /**
   * Fetches the contents of the ChordPro file from SongSelect
   * @param {SongDetails} songDetails 
   * @returns {Promise<ChordProResponse>} the ChordPro file content
   */
  async fetchChordProText(songDetails) {
    const parameters = this.createChordProParameters(songDetails);
    const url = `${SongSelectAPI.BASE_URL}/GetSongChordPro?${parameters.toString()}`;
    const res = await fetch(url);
    const data = await res.json();

    const payload = data.payload;
    if (payload === undefined || payload === "") {
      throw new Error(`Missing Chord Pro payload in response data: ${data}`);
    }

    const rawText = payload.trimStart();
    if (!rawText || rawText.trim() === "") {
      throw new Error("❌ This song does not have a ChordPro file available on CCLI.");
    }

    return new ChordProResponse(rawText);
  }

  /**
   * Creates URL Search Parameters from song details
   * @param {SongDetails} songDetails 
   * @returns {URLSearchParams}
   */
  createChordProParameters(songDetails) {
    return new URLSearchParams({
      songNumber: songDetails.ccliId,
      key: songDetails.key,
      style: SongSelectAPI.CHORD_NOTATION,
      columns: SongSelectAPI.CHORD_COLUMNS,
    });
  }
}

class TokenStorage {
  static ACCESS_TOKEN_KEY = "access_token";
  static REFRESH_TOKEN_KEY = "refresh_token";
  static CLIENT_ID_KEY = "client_id";
  static CLIENT_SECRET_KEY = "client_secret";
  static EXPIRES_AT_KEY = "expires_at";

  saveToken(tokenData) {
    GM_setValue(TokenStorage.ACCESS_TOKEN_KEY, tokenData.access_token);
    GM_setValue(TokenStorage.REFRESH_TOKEN_KEY, tokenData.refresh_token);
    GM_setValue(TokenStorage.EXPIRES_AT_KEY, Date.now() + tokenData.expires_in * 1000);
  }

  promptForCredentials() {
    const validId = this._promptForClientId();
    const validSecret = this._promptForClientSecret();

    if (validId && validSecret) {
      console.info("Client ID and secret have been saved.");
      alert("✅ Credentials saved.");
      return;
    }
  }

  _promptForClientId() {
    const id = prompt("Please enter your Planning Center client ID:");
    if (!id || id.trim() === "") {
      console.error("Client ID cannot be empty.");
      alert("❌ Client ID cannot be empty.");
      return;
    }

    GM_setValue("client_id", id.trim());
    console.debug("Client ID has been saved.");

    return true;
  }

  _promptForClientSecret() {
    const secret = prompt("Please enter your Planning Center client secret:");
    if (!secret || secret.trim() === "") {
      console.error("Client secret cannot be empty.");
      alert("❌ Client secret cannot be empty.");
      return;
    }

    GM_setValue("client_secret", secret.trim());
    console.debug("Client secret has been saved.");

    return true;
  }

  get accessToken() {
    return GM_getValue(TokenStorage.ACCESS_TOKEN_KEY, null);
  }

  get refreshToken() {
    return GM_getValue(TokenStorage.REFRESH_TOKEN_KEY, null);
  }

  get isTokenValid() {
    const raw = GM_getValue(TokenStorage.EXPIRES_AT_KEY, 0);
    const expiresAt = Number(raw);
    return Date.now() < expiresAt;
  }

  get clientId() {
    return GM_getValue(TokenStorage.CLIENT_ID_KEY, null);
  }

  get clientSecret() {
    return GM_getValue(TokenStorage.CLIENT_SECRET_KEY, null);
  }

  get hasCredentials() {
    return this.clientId && this.clientSecret;
  }
}

class GMHttpClient {
  constructor() {
  }

  get(url, headers = {}) {
    return this.performRequest({
      method: "GET",
      url: url,
      headers: headers,
    });
  }

  post(url, headers = {}, data = {}) {
    return this.performRequest({
      method: "POST",
      url: url,
      headers: headers,
      data: data,
    });
  }

  patch(url, headers = {}, data = {}) {
    return this.performRequest({
      method: "PATCH",
      url: url,
      headers: headers,
      data: data,
    });
  }

  /**
   * Sends a GM_xmlhttpRequest and returns a Promise.
   * @param {Object} options - Same options as GM_xmlhttpRequest.
   * @returns {Promise<Object>} - Resolves with the response or rejects on error.
   */
  performRequest(options) {
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
    this.tokenStorage = new TokenStorage();
    this.gmHttpClient = new GMHttpClient();
  }

  async exchangeCodeForToken(code) {
    const searchParams = this.generateTokenSearchParams(code);

    console.info("🔄 Attempting to exchange code for token...");

    const response = await this.gmHttpClient.post(OAuthClient.CONFIG.TOKEN_URL, this.headers, searchParams.toString());
    const result = JSON.parse(response.responseText);
    this.tokenStorage.saveToken(result);

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

  generateTokenSearchParams(code) {
    return new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: OAuthClient.CONFIG.REDIRECT_URI,
    });
  }

  async refreshAccessToken() {
    console.info("🔄 Attempting to refresh token...");

    const searchParams = this.generateRefreshTokenSearchParams();

    const response = await this.gmHttpClient.post(OAuthClient.CONFIG.TOKEN_URL, this.headers, searchParams.toString()).catch(err => {
      console.error("🔁 Token refresh failed:", response);
      alert("Refresh token is invalid or expired. Please log in again.");
      throw new Error("Refresh request failed:", err);
    });

    this.onSuccessfulRefreshResponse(response);
  }

  generateRefreshTokenSearchParams() {
    return new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.tokenStorage.refreshToken,
    });
  }

  onSuccessfulRefreshResponse(response) {
    const result = JSON.parse(response.responseText);
    this.tokenStorage.saveToken(result);
    console.info("✅ Token refreshed successfully.");
  }

  get headers() {
    const authHeader = btoa(`${this.tokenStorage.clientId}:${this.tokenStorage.clientSecret}`);

    return {
      "Authorization": `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };
  }

  get authUrl() {
    const state = Math.random().toString(36).substring(2);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.tokenStorage.clientId,
      redirect_uri: OAuthClient.CONFIG.REDIRECT_URI,
      scope: OAuthClient.CONFIG.SCOPE,
      state,
    });

    return `${OAuthClient.CONFIG.AUTH_URL}?${params.toString()}`;
  }
}

class OAuthFlow {
  static POPUP_WIDTH = 500;
  static POPUP_HEIGHT = 700;

  constructor() {
    this.client = new OAuthClient();
    this.tokenStorage = new TokenStorage();
  }

  init() {
    if (!this.tokenStorage.hasCredentials) {
      this.tokenStorage.promptForCredentials();
    }

    console.debug(`Window location: ${window.location.href}`);

    if (window.location.href.startsWith(OAuthClient.CONFIG.REDIRECT_URI)) {
      this._handleRedirect();
    } else {
      this._setupMessageListener();
    }
  }

  async refreshToken() {
    if (this.tokenStorage.refreshToken) {
      await this.client.refreshAccessToken();
    } else {
      throw new Error("No refresh token available. Please log in again.");
    }
  }

  startLogin() {
    const popup = window.open(this.client.authUrl, "oauthPopup", this.popupFeatures);
    if (!popup || popup.closed || typeof popup.closed === "undefined") {
      console.error(`Popup blocked! Please allow popups for this site.`);
      alert("❌ Popup blocked! Please allow popups for this site.");
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
    window.addEventListener("message", (event) => this._onMessage(event));
  }

  _onMessage(event) {
    if (event.data?.type !== "oauth_complete" || !event.data.access_token) {
      console.debug("Invalid message received:", event.data);
      return;
    }

    this.tokenStorage.saveToken(event.data);
    console.info("✅ Token received and stored.");
  }

  get popupFeatures() {
    return `width=${OAuthFlow.POPUP_WIDTH},height=${OAuthFlow.POPUP_HEIGHT},menubar=no,location=no,resizable=yes,scrollbars=yes,status=no`;
  }
}

class SongDetails {
  constructor(
    ccliId = 0,
    admin = "",
    key = "C",
    bpm = 0,
    copyright = "",
    title = "",
    author = "",
    themes = ""
  ) {
    this.ccliId = ccliId;
    this.admin = admin;
    this.key = key;
    this.bpm = bpm;
    this.copyright = copyright;
    this.title = title;
    this.author = author;
    this.themes = themes;
  }

  /**
   * Deserializes the JSON into a SongDetails object
   * @param {Object} json from the SongSelect API response
   * @returns {SongDetails}
   */
  static deserialize(json) {
    return new SongDetails(
      json.ccliSongNumber,
      SongDetails._extractAdmin(json.administrators),
      SongDetails._extractDefaultKey(json.defaultKey),
      SongDetails._extractBpm(json.bpm),
      json.copyrights,
      json.title,
      SongDetails._extractAuthor(json.authors),
      SongDetails._extractThemes(json.themes)
    );
  }

  serializeForPlanningCenter(songId) {
    return {
      data: {
        type: "Song",
        attributes: {
          title: this.title,
          admin: this.songDetails,
          author: this.author,
          copyright: this.copyright,
          ccli_number: songId,
          hidden: false,
          themes: this.themes,
        }
      }
    };
  }

  static _extractBpm(bpm) {
    if (bpm && !isNaN(Number(bpm))) {
      return Number(bpm);
    } else {
      return 0;
    }
  }

  static _extractAdmin(admin) {
    if (Array.isArray(admin)) {
      return admin.map(a => typeof a === "string" ? a : a.label).join(", ");
    } else if (typeof admin === "string") {
      return admin;
    } else {
      return "";
    }
  }

  static _extractAuthor(author) {
    if (Array.isArray(author)) {
      return author.map(a => typeof a === "string" ? a : a.label).join(", ");
    } else if (typeof author === "string") {
      return author;
    } else {
      return "";
    }
  }

  static _extractDefaultKey(defaultKey) {
    return Array.isArray(defaultKey) && defaultKey.length > 0 ? defaultKey[0] : "C";
  }

  static _extractThemes(themes) {
    return Array.isArray(themes) ? themes.map(t => typeof t === "string" ? t : t.label) : [];
  }
}

class PlanningCenterAPI {
  static BASE_URL = "https://api.planningcenteronline.com/services/v2";

  constructor() {
    this.tokenStorage = new TokenStorage();
    this.gmHttpClient = new GMHttpClient();
  }

  async findSongById(ccliID) {
    const json = await this._getRequest(`/songs?where[ccli_number]=${ccliID}`);
    if (!json.data || json.data.length === 0) {
      throw new Error(`No song found with CCLI ID ${ccliID}`);
    }

    return json.data[0];
  }

  async addSong(songId, songDetails) {
    const songPayload = songDetails.serializeForPlanningCenter(songId);
    const json = await this._postRequest("/songs", songPayload);
    return json.data;
  }

  async getArrangements(songId) {
    const json = await this._getRequest(`/songs/${songId}/arrangements`);
    return json.data;
  }

  async updateArrangement(songApiId, arrangementId, arrangementKey, chordPro, tempo = 0, lyricsEnabled = true) {
    const payload = {
      data: {
        type: "Arrangement",
        attributes: {
          chord_chart_key: arrangementKey,
          lyrics_enabled: lyricsEnabled,
          chord_chart: chordPro,
          bpm: tempo,
        }
      }
    };
    return await this._patchRequest(`/songs/${songApiId}/arrangements/${arrangementId}`, payload);
  }

  async addArrangementKey(songApiId, arrangementId, startingKey) {
    const keysPayload = {
      data: {
        type: "Key",
        attributes: {
          name: "Default",
          starting_key: startingKey,
        }
      }
    };

    return await this._postRequest(`/songs/${songApiId}/arrangements/${arrangementId}/keys`, keysPayload);
  }

  async _getRequest(endpoint) {
    return this._request("GET", endpoint);
  }

  async _postRequest(endpoint, payload) {
    return this._request("POST", endpoint, payload);
  }

  async _patchRequest(endpoint, payload) {
    return this._request("PATCH", endpoint, payload);
  }

  async _request(method, endpoint, payload = null) {
    const url = `${PlanningCenterAPI.BASE_URL}${endpoint}`;
    let response;
    switch (method) {
      case "GET":
        response = await this.gmHttpClient.get(url, this.defaultHeaders);
        break;
      case "POST":
        response = await this.gmHttpClient.post(url, this.defaultHeaders, JSON.stringify(payload));
        break;
      case "PATCH":
        response = await this.gmHttpClient.patch(url, this.defaultHeaders, JSON.stringify(payload));
        break;
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }

    return JSON.parse(response.responseText);
  }

  get defaultHeaders() {
    return {
      "Authorization": `Bearer ${this.tokenStorage.accessToken}`,
      "Content-Type": "application/json",
    };
  }
}

class App {
  constructor() {
    this.authFlow = new OAuthFlow();
    this.tokenStorage = new TokenStorage();
    this.planningCenterService = new PlanningCenterAPI();
    this.songSelectAPI = new SongSelectAPI();
    this.songFinder = new SongFinder();
  }

  run() {
    this.authFlow.init();
    GM_registerMenuCommand("⬇️ Import Song to Planning Center", () => this.importSongToPlanningCenter());
  }

  async importSongToPlanningCenter() {
    if (!this.isCorrectPage()) {
      alert("❌ You must be on a song page to use this.");
      return;
    }

    if (!this.tokenStorage.isTokenValid) {
      console.debug("Token is invalid or expired. Attempting to refresh...");
      console.debug(this.authFlow);
      await this.authFlow.refreshToken().catch(err => {
        console.error("Failed to refresh token:", err);
        alert("❌ Could not access Planning Center. Please log in and try again.");
        this.authFlow.startLogin();
        throw new Error("Aborting import due to user not being logged in.");
      });
    }

    const ccliSongId = this.songFinder.getSongId();
    const existingSong = await this.planningCenterService.findSongById(ccliSongId).catch(console.debug);

    const slug = location.pathname.split("/").pop();
    const songDetails = await this.songSelectAPI.fetchSongDetails(ccliSongId, slug);

    let songId;
    if (existingSong) {
      console.info("Song already exists in Planning Center.");
      songId = existingSong.id;
    } else {
      try {
        const createdSong = await this.planningCenterService.addSong(ccliSongId, songDetails);
        console.info("✅ Song added to Planning Center!");
        songId = createdSong.id;
        if (!songId) {
          console.error("Song ID is missing.");
          throw new Error("❌ Song ID is missing.");
        }
      } catch (error) {
        console.error("Failed to add song:", error);
        alert("❌ Failed to add song.");
        return;
      }
    }

    let arrangementId;
    try {
      const existingArrangements = await this.planningCenterService.getArrangements(songId);
      if (!existingArrangements || existingArrangements.length === 0) {
        throw new Error("No arrangements found for this song.");
      }

      arrangementId = existingArrangements[0].id;
      if (!arrangementId || !songDetails.key) {
        throw new Error("❌ Arrangement ID or key is missing."); 
      }
    } catch (err) {
      console.error("Failed to fetch arrangements:", err);
      alert("❌ Failed to fetch arrangements.");
      return;
    }

    let chordProResponse;
    try {
      chordProResponse = await this.songSelectAPI.fetchChordProText(songDetails);
    } catch (err) {
      console.error("Failed to fetch ChordPro text:", err);
      alert("❌ This song does not have a ChordPro file available on CCLI.");
      return;
    }

    try {
      await this.planningCenterService.updateArrangement(
        songId,
        arrangementId,
        songDetails.key,
        chordProResponse.toPlanningCenter(),
        songDetails.bpm,
      );
      console.info("✅ Arrangement updated in Planning Center!");
    } catch (error) {
      console.error("Failed to update arrangement:", error);
      alert("❌ Failed to update arrangement.");
      return;
    }
    
    try {
      await this.planningCenterService.addArrangementKey(
        songId,
        arrangementId,
        songDetails.key,
      );
      console.info("✅ Added default key for arrangement:", songDetails.key);
    } catch (error) {
      console.warn("Failed to add default key:", error);
    }

    alert("✅ Song has been added to Planning Center!");
  }

  isCorrectPage() {
    return location.pathname.startsWith("/songs");
  }
}

const app = new App();
app.run();

// Browser extension storage wrapper
class ExtensionStorage {
  static async getValue(key, defaultValue = null) {
    return new Promise((resolve) => {
      chrome.storage.local.get({ [key]: defaultValue }).then((result) => {
        resolve(result[key]);
      });
    });
  }

  static async setValue(key, value) {
    return chrome.storage.local.set({ [key]: value });
  }

  static async deleteValue(key) {
    return chrome.storage.local.remove(key);
  }
}

// HTTP Client for extension
class ExtensionHttpClient {
  constructor() { }

  async get(url, headers = {}) {
    return this.performRequest("GET", url, headers);
  }

  async post(url, headers = {}, data = null) {
    return this.performRequest("POST", url, headers, data);
  }

  async patch(url, headers = {}, data = null) {
    return this.performRequest("PATCH", url, headers, data);
  }

  async performRequest(method, url, headers = {}, rawData = null) {
    const data = await this.getSerializedData(rawData);

    // Send request to background script to bypass CORS
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: "http_request",
        method,
        url,
        headers,
        data
      }, (response) => {
        if (response && response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  }

  async getSerializedData(rawData) {
    if (rawData instanceof FormData) {
      return await this.serializeFormData(rawData);
    }

    return rawData;
  }

  async serializeFormData(formData) {
    const formDataEntries = {};
    for (const [key, value] of formData.entries()) {
      if (value instanceof File || value instanceof Blob) {
        // Convert File/Blob to ArrayBuffer for serialization
        const arrayBuffer = await value.arrayBuffer();
        formDataEntries[key] = {
          type: "file",
          name: value.name || "file",
          data: Array.from(new Uint8Array(arrayBuffer)),
          contentType: value.type
        };
      } else {
        formDataEntries[key] = { type: "string", data: value };
      }
    }

    return { type: "formData", entries: formDataEntries };
  }
}

// Copy all classes from userscript but modify GM_ functions
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
    if (!songDetails.products.chordPro.exists) {
      throw new Error("This song does not have a ChordPro file available on CCLI.");
    }

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
      throw new Error("The ChordPro file does not seem to be available on CCLI.");
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

  /**
   * Downloads a leadsheet from SongSelect
   * @param {SongDetails} songDetails 
   * @returns {Promise<Blob>} the leadsheet PDF blob
   */
  async downloadLeadsheet(songDetails) {
    if (!songDetails.products.lead.exists) {
      throw new Error("This song does not have a leadsheet available on CCLI.");
    }

    const parameters = this.createLeadsheetParameters(songDetails);
    const url = `${SongSelectAPI.BASE_URL}/GetSongLeadPdf?${parameters.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download leadsheet: ${response.statusText}`);
      }

      const pdfBlob = await response.blob();
      if (pdfBlob.size === 0) {
        throw new Error("Attempted to donload a leadsheet without it being available on CCLI.");
      }

      return pdfBlob;
    } catch (error) {
      throw new Error("Error downloading leadsheet:", error);
    }
  }

  /**
   * Create leadsheet parameters for the API request
   * @param {SongDetails} songDetails 
   * @returns the URLSearchParams for the leadsheet request
   */
  createLeadsheetParameters(songDetails) {
    return new URLSearchParams({
      songNumber: songDetails.ccliId,
      key: songDetails.key,
      style: SongSelectAPI.CHORD_NOTATION,
      columns: SongSelectAPI.CHORD_COLUMNS,
      octave: 0,
      noteSize: 0,
      orientation: "Portrait",
      paperSize: "A4",
      activityType: "downloaded",
      renderer: "legacy",
    });
  }

  /**
   * Downloads a vocal sheet from SongSelect
   * @param {SongDetails} songDetails 
   * @returns {Promise<Blob>} the vocal sheet PDF blob
   */
  async downloadVocalSheet(songDetails) {
    if (!songDetails.products.vocal.exists) {
      throw new Error("This song does not have a leadsheet available on CCLI.");
    }

    const parameters = this.createVocalSheetParameters(songDetails);
    const url = `${SongSelectAPI.BASE_URL}/GetSongVocalPdf?${parameters.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download vocal sheet: ${response.statusText}`);
      }

      const pdfBlob = await response.blob();
      if (pdfBlob.size === 0) {
        throw new Error("Attempted to download a vocal sheet without it being available on CCLI.");
      }

      return pdfBlob;
    } catch (error) {
      throw new Error("Error downloading vocal sheet:", error);
    }
  }

  /**
   * Create vocal sheet parameters for the API request
   * @param {SongDetails} songDetails 
   * @returns the URLSearchParams for the vocal sheet request
   */
  createVocalSheetParameters(songDetails) {
    return new URLSearchParams({
      songNumber: songDetails.ccliId,
      transposeKey: songDetails.key,
      octave: 0,
      noteSize: 0,
      orientation: "Portrait",
      paperSize: "A4",
      activityType: "downloaded",
      renderer: "legacy",
    });
  }
}

class TokenStorage {
  static ACCESS_TOKEN_KEY = "access_token";
  static REFRESH_TOKEN_KEY = "refresh_token";
  static EXPIRES_AT_KEY = "expires_at";
  static PENDING_IMPORT_KEY = "pending_import";
  static CODE_VERIFIER_KEY = "code_verifier";
  static TEN_MINUTES_IN_MS = 10 * 60 * 1000;

  async saveToken(tokenData) {
    await ExtensionStorage.setValue(TokenStorage.ACCESS_TOKEN_KEY, tokenData.access_token);
    await ExtensionStorage.setValue(TokenStorage.REFRESH_TOKEN_KEY, tokenData.refresh_token);
    await ExtensionStorage.setValue(TokenStorage.EXPIRES_AT_KEY, Date.now() + tokenData.expires_in * 1000);
  }

  async saveCodeVerifier(codeVerifier) {
    await ExtensionStorage.setValue(TokenStorage.CODE_VERIFIER_KEY, codeVerifier);
  }

  async getCodeVerifier() {
    return await ExtensionStorage.getValue(TokenStorage.CODE_VERIFIER_KEY, null);
  }

  async clearCodeVerifier() {
    await ExtensionStorage.deleteValue(TokenStorage.CODE_VERIFIER_KEY);
  }

  async setPendingImport(songId, slug) {
    const data = JSON.stringify({ songId, slug, timestamp: Date.now() });
    await ExtensionStorage.setValue(TokenStorage.PENDING_IMPORT_KEY, data);
  }

  async getPendingImport() {
    const pendingImport = await ExtensionStorage.getValue(TokenStorage.PENDING_IMPORT_KEY, null);
    if (!pendingImport) return null;

    try {
      const data = JSON.parse(pendingImport);
      if (Date.now() - data.timestamp > TokenStorage.TEN_MINUTES_IN_MS) {
        await this.clearPendingImport();
        return null;
      }
      return data;
    } catch {
      await this.clearPendingImport();
      return null;
    }
  }

  async clearPendingImport() {
    await ExtensionStorage.deleteValue(TokenStorage.PENDING_IMPORT_KEY);
  }

  async getAccessToken() {
    return await ExtensionStorage.getValue(TokenStorage.ACCESS_TOKEN_KEY, null);
  }

  async getRefreshToken() {
    return await ExtensionStorage.getValue(TokenStorage.REFRESH_TOKEN_KEY, null);
  }

  async isTokenValid() {
    const raw = await ExtensionStorage.getValue(TokenStorage.EXPIRES_AT_KEY, 0);
    const expiresAt = Number(raw);
    return Date.now() < expiresAt;
  }
}

class OAuthClient {
  static CONFIG = {
    CLIENT_ID: "0ee14294650bb97000608fc17e63ce8616c3728e97d3219f45156f493d410ccc",
    REDIRECT_URI: "https://services.planningcenteronline.com/dashboard/0",
    AUTH_URL: "https://api.planningcenteronline.com/oauth/authorize",
    TOKEN_URL: "https://api.planningcenteronline.com/oauth/token",
    SCOPE: "services",
  };

  constructor() {
    this.tokenStorage = new TokenStorage();
    this.httpClient = new ExtensionHttpClient();
  }

  async exchangeCodeForToken(code) {
    const codeVerifier = await this.tokenStorage.getCodeVerifier();
    if (!codeVerifier) {
      throw new Error("Code verifier not found. Please restart the authentication process.");
    }

    const searchParams = this.generateTokenSearchParams(code, codeVerifier);

    console.info("🔄 Attempting to exchange code for token...");

    const response = await this.httpClient.post(OAuthClient.CONFIG.TOKEN_URL, this.headers, searchParams.toString());
    const result = JSON.parse(response.responseText);
    await this.tokenStorage.saveToken(result);
    await this.tokenStorage.clearCodeVerifier();

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

  generateTokenSearchParams(code, codeVerifier) {
    return new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: OAuthClient.CONFIG.REDIRECT_URI,
      client_id: OAuthClient.CONFIG.CLIENT_ID,
      code_verifier: codeVerifier,
    });
  }

  async refreshAccessToken() {
    console.info("🔄 Attempting to refresh token...");

    const refreshToken = await this.tokenStorage.getRefreshToken();
    const searchParams = this.generateRefreshTokenSearchParams(refreshToken);

    const response = await this.httpClient.post(OAuthClient.CONFIG.TOKEN_URL, this.headers, searchParams.toString()).catch(err => {
      console.error("🔁 Token refresh failed:", err);
      alert("Refresh token is invalid or expired. Please log in again.");
      throw new Error("Refresh request failed:", err);
    });

    this.onSuccessfulRefreshResponse(response);
  }

  generateRefreshTokenSearchParams(refreshToken) {
    return new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: OAuthClient.CONFIG.CLIENT_ID,
    });
  }

  async onSuccessfulRefreshResponse(response) {
    const result = JSON.parse(response.responseText);
    await this.tokenStorage.saveToken(result);
    console.info("✅ Token refreshed successfully.");
  }

  get headers() {
    return {
      "Content-Type": "application/x-www-form-urlencoded",
    };
  }

  async generateAuthUrl() {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

    await this.tokenStorage.saveCodeVerifier(codeVerifier);

    const state = Math.random().toString(36).substring(2);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: OAuthClient.CONFIG.CLIENT_ID,
      redirect_uri: OAuthClient.CONFIG.REDIRECT_URI,
      scope: OAuthClient.CONFIG.SCOPE,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return `${OAuthClient.CONFIG.AUTH_URL}?${params.toString()}`;
  }

  generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }

  async generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }
}

class OAuthFlow {
  static POPUP_WIDTH = 500;
  static POPUP_HEIGHT = 700;

  constructor() {
    this.client = new OAuthClient();
    this.tokenStorage = new TokenStorage();
    this.onAuthCompleteCallback = null;
  }

  init() {
    console.debug(`Window location: ${window.location.href}`);

    if (window.location.href.startsWith(OAuthClient.CONFIG.REDIRECT_URI)) {
      this._handleRedirect();
    } else {
      this._setupMessageListener();
    }
  }

  async refreshToken() {
    const refreshToken = await this.tokenStorage.getRefreshToken();
    if (refreshToken) {
      await this.client.refreshAccessToken();
    } else {
      throw new Error("No refresh token available. Please log in again.");
    }
  }

  async startLogin() {
    const authUrl = await this.client.generateAuthUrl();
    const popup = window.open(authUrl, "oauthPopup", this.popupFeatures);
    if (!popup || popup.closed || typeof popup.closed === "undefined") {
      const message = [
        "❌ Popup was blocked!",
        "",
        "To use this extension:",
        "1. Allow popups for songselect.ccli.com",
        "2. Try the import again",
        "",
        "The popup is needed to securely connect to Planning Center."
      ].join("\n");
      alert(message);
      console.error("Popup blocked! Please allow popups for this site.");
      return;
    }

    // Show user feedback that login is in progress
    console.info("🔐 Opening Planning Center login...");
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

  setAuthCompleteCallback(callback) {
    this.onAuthCompleteCallback = callback;
  }

  async _onMessage(event) {
    if (event.data?.type !== "oauth_complete" || !event.data.access_token) {
      console.debug("Invalid message received:", event.data);
      return;
    }

    await this.tokenStorage.saveToken(event.data);
    console.info("✅ Successfully connected to Planning Center!");

    // Check if we should automatically continue with import
    const pendingImport = await this.tokenStorage.getPendingImport();
    if (pendingImport && this.onAuthCompleteCallback) {
      console.info("🔄 Automatically continuing with pending import...");
      await this.tokenStorage.clearPendingImport();
      // Use setTimeout to ensure the auth flow completes first
      setTimeout(() => this.onAuthCompleteCallback(pendingImport), 100);
    } else {
      alert("✅ Successfully connected to Planning Center! You can now import songs.");
    }
  }

  get popupFeatures() {
    return `width=${OAuthFlow.POPUP_WIDTH},height=${OAuthFlow.POPUP_HEIGHT},menubar=no,location=no,resizable=yes,scrollbars=yes,status=no`;
  }
}

class SongProduct {
  constructor(
    exists = false,
    authorized = false,
    noAuthReason = "",
    exceededMaxUniqueSongCount = false,
  ) {
    this.exists = exists;
    this.authorized = authorized;
    this.noAuthReason = noAuthReason;
    this.exceededMaxUniqueSongCount = exceededMaxUniqueSongCount;
  }

  static deserialize(json) {
    return new SongProduct(
      json.exists,
      json.authorized,
      json.noAuthReason,
      json.exceededMaxUniqueSongCount,
    );
  }
}

class SongProducts {
  constructor(
    general = new SongProduct(),
    lyrics = new SongProduct(),
    chords = new SongProduct(),
    chordPro = new SongProduct(),
    lead = new SongProduct(),
    vocal = new SongProduct(),
    multitracks = new SongProduct(),
  ) {
    this.general = general;
    this.lyrics = lyrics;
    this.chords = chords;
    this.chordPro = chordPro;
    this.lead = lead;
    this.vocal = vocal;
    this.multitracks = multitracks;
  }

  static deserialize(json) {
    return new SongProducts(
      SongProduct.deserialize(json.general),
      SongProduct.deserialize(json.lyrics),
      SongProduct.deserialize(json.chords),
      SongProduct.deserialize(json.chordPro),
      SongProduct.deserialize(json.lead),
      SongProduct.deserialize(json.vocal),
      SongProduct.deserialize(json.multitracks),
    );
  }
}

class SongDetails {
  constructor(
    ccliId = 0,
    admin = "",
    key = "C",
    bpm = null,
    copyright = "",
    title = "",
    author = "",
    themes = "",
    products = new SongProducts()
  ) {
    this.ccliId = ccliId;
    this.admin = admin;
    this.key = key;
    this.bpm = bpm;
    this.copyright = copyright;
    this.title = title;
    this.author = author;
    this.themes = themes;
    this.products = products;
  }

  /**
   * Deserializes the JSON into a SongDetails object
   * @param {Object} json from the SongSelect API response
   * @returns {SongDetails}
   */
  static deserialize(json) {
    console.debug("Deserializing song details:", json);

    return new SongDetails(
      json.ccliSongNumber,
      SongDetails._extractAdmin(json.administrators),
      SongDetails._extractDefaultKey(json.defaultKey),
      SongDetails._extractBpm(json.bpm),
      json.copyrights.trim(),
      json.title.trim(),
      SongDetails._extractAuthor(json.authors),
      SongDetails._extractThemes(json.themes),
      SongProducts.deserialize(json.products),
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
      return null;
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
      return author.map(a => typeof a === "string" ? a.trim() : a.label.trim()).join(", ");
    } else if (typeof author === "string") {
      return author.trim();
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

/**
 * Represents the attributes of a file in Planning Center
 * @param {string} name - The name of the file
 * @param {string} contentType - The content type of the file
 * @param {number} fileSize - The size of the file in bytes
 */
class FileAttributes {
  constructor(
    name = "",
    contentType = "",
    fileSize = 0,
  ) {
    this.name = name;
    this.contentType = contentType;
    this.fileSize = fileSize;
  }

  static deserialize(json) {
    return new FileAttributes(
      json.name,
      json.content_type,
      json.file_size,
    );
  }
}

/**
 * Represents a file in Planning Center - returned from the upload API
 * @param {string} id - The ID of the file
 * @param {string} type - The type of the file
 * @param {FileAttributes} attributes - The attributes of the file
 */
class PlanningCenterFile {
  constructor(
    id = "",
    type = "",
    attributes = new FileAttributes(),
  ) {
    this.id = id;
    this.type = type;
    this.attributes = attributes;
  }

  static deserialize(json) {
    if (!json || !Array.isArray(json) || json.length === 0) {
      throw new Error("Invalid JSON data for PlanningCenterFile");
    }

    const firstFile = json[0];

    return new PlanningCenterFile(
      firstFile.id,
      firstFile.type,
      FileAttributes.deserialize(firstFile.attributes),
    );
  }
}

class PlanningCenterAPI {
  static BASE_URL = "https://api.planningcenteronline.com/services/v2";
  static FILE_UPLOAD_ENDPOINT = "https://upload.planningcenteronline.com/v2/files";

  constructor() {
    this.tokenStorage = new TokenStorage();
    this.httpClient = new ExtensionHttpClient();
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

  async getArrangementKeys(songApiId, arrangementId) {
    const json = await this._getRequest(`/songs/${songApiId}/arrangements/${arrangementId}/keys`);
    return json.data;
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

  /**
   * Uploads a leadsheet PDF to Planning Center
   * @param {SongDetails} songDetails the song details
   * @param {number} songId the planning center song ID
   * @param {number} arrangementId 
   * @param {Blob} blob 
   */
  async uploadLeadsheet(songDetails, songId, arrangementId, blob) {
    const filename = this._generateFilename(songDetails, "lead");
    const file = await this._uploadFile(blob, filename);
    return await this._attachFileToArrangement(songId, arrangementId, file);
  }

  /**
   * Uploads a vocal sheet PDF to Planning Center
   * @param {SongDetails} songDetails 
   * @param {number} songId 
   * @param {number} arrangementId 
   * @param {Blob} blob 
   */
  async uploadVocalSheet(songDetails, songId, arrangementId, blob) {
    const filename = this._generateFilename(songDetails, "vocal");
    const file = await this._uploadFile(blob, filename);
    return await this._attachFileToArrangement(songId, arrangementId, file);
  }

  /**
   * Generates a sanitized filename for uploading
   * @param {SongDetails} songDetails the song details
   * @param {string} fileType the type of file (e.g., "lead", "vocal")
   * @returns {string} sanitized filename
   */
  _generateFilename(songDetails, fileType) {
    const sanitizedTitle = songDetails.title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
    return `${sanitizedTitle}-${songDetails.key}-${fileType}.pdf`;
  }

  /**
   * Uploads a file to Planning Center"s upload service
   * @param {Blob} blob the file blob to upload
   * @param {string} filename the filename to use
   * @returns {Promise<PlanningCenterFile>} the uploaded file object
   */
  async _uploadFile(blob, filename) {
    const formData = new FormData();
    formData.append("file", blob, filename);

    const response = await this.httpClient.post(PlanningCenterAPI.FILE_UPLOAD_ENDPOINT, null, formData);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to upload ${filename}.`);
    }

    console.debug("File upload response:", response);

    const json = JSON.parse(response.responseText);
    if (!json.data || json.data.length === 0) {
      throw new Error(`Failed to upload ${filename}.`);
    }

    return PlanningCenterFile.deserialize(json.data);
  }

  /**
   * Attaches an uploaded file to an arrangement
   * @param {number} songId the planning center song ID
   * @param {number} arrangementId the arrangement ID
   * @param {PlanningCenterFile} file the file object from upload
   * @returns {Promise<Object>} the attachment response
   */
  async _attachFileToArrangement(songId, arrangementId, file) {
    const payload = {
      data: {
        type: "Attachment",
        attributes: {
          file_upload_identifier: file.id,
          filename: file.attributes.name,
        }
      }
    };

    const attachResponse = await this._postRequest(`/songs/${songId}/arrangements/${arrangementId}/attachments`, payload);
    if (attachResponse.status < 200 || attachResponse.status >= 300) {
      throw new Error("Failed to attach file.", attachResponse);
    }

    console.debug("File attach response:", attachResponse);
    return attachResponse;
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
    const defaultHeaders = await this.getDefaultHeaders();
    let response;
    switch (method) {
      case "GET":
        response = await this.httpClient.get(url, defaultHeaders);
        break;
      case "POST":
        response = await this.httpClient.post(url, defaultHeaders, JSON.stringify(payload));
        break;
      case "PATCH":
        response = await this.httpClient.patch(url, defaultHeaders, JSON.stringify(payload));
        break;
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }

    return JSON.parse(response.responseText);
  }

  async getDefaultHeaders() {
    const accessToken = await this.tokenStorage.getAccessToken();
    return {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
  }
}

class ProgressIndicator {
  constructor() {
    this.modal = null;
    this.progressBar = null;
    this.statusText = null;
    this.detailsText = null;
    this.currentStep = 0;
    this.totalSteps = 0;
  }

  show(title = "Processing...", totalSteps = 1) {
    this.totalSteps = totalSteps;
    this.currentStep = 0;
    this.createModal(title);
    this.showModal();
  }

  updateProgress(step, statusText, detailsText = "") {
    if (!this.modal) {
      return;
    }

    this.currentStep = step;
    const percentage = Math.round((step / this.totalSteps) * 100);

    // Remove any state classes and update width
    this.progressBar.classList.remove("error", "success", "complete");
    this.progressBar.style.width = `${percentage}%`;
    this.statusText.textContent = statusText;
    this.detailsText.textContent = detailsText;
  }

  setError(errorText, detailsText = "") {
    if (!this.modal) {
      return;
    }

    this.progressBar.classList.add("error");
    this.statusText.textContent = "❌ " + errorText;
    this.detailsText.textContent = detailsText;

    // Add close button for errors
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.className = "ccli-btn ccli-btn-secondary";
    closeBtn.onclick = () => this.close();
    this.modal.querySelector(".ccli-modal-footer").appendChild(closeBtn);
  }

  setSuccess(successText, detailsText = "") {
    if (!this.modal) {
      return;
    }

    this.progressBar.classList.add("success", "complete");
    this.statusText.textContent = "✅ " + successText;
    this.detailsText.textContent = detailsText;

    // Auto-close after 3 seconds
    setTimeout(() => this.close(), 3000);
  }

  createModal(title) {
    this.remove();

    this.modal = document.createElement("div");
    this.modal.id = "ccli-progress-modal";
    this.modal.innerHTML = `
      <div class="ccli-modal-overlay">
        <div class="ccli-modal-content ccli-progress-content">
          <div class="ccli-modal-header">
            <h2>${title}</h2>
          </div>
          <div class="ccli-modal-body">
            <div class="ccli-progress-container">
              <div class="ccli-progress-bar-bg">
                <div class="ccli-progress-bar"></div>
              </div>
              <div class="ccli-progress-status"></div>
              <div class="ccli-progress-details"></div>
            </div>
          </div>
          <div class="ccli-modal-footer"></div>
        </div>
      </div>
    `;

    this.progressBar = this.modal.querySelector(".ccli-progress-bar");
    this.statusText = this.modal.querySelector(".ccli-progress-status");
    this.detailsText = this.modal.querySelector(".ccli-progress-details");

    document.body.appendChild(this.modal);
  }

  showModal() {
    this.modal.classList.remove("ccli-modal-hidden");
    this.modal.classList.add("ccli-modal-visible");
  }

  close() {
    this.remove();
  }

  remove() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }
}

class TemplateLoader {
  static cache = new Map();

  static async loadTemplate(templateName) {
    if (this.cache.has(templateName)) {
      return this.cache.get(templateName);
    }

    try {
      const url = chrome.runtime.getURL(`src/templates/${templateName}.html`);
      const response = await fetch(url);
      const html = await response.text();
      this.cache.set(templateName, html);
      return html;
    } catch (error) {
      console.error(`Failed to load template ${templateName}:`, error);
      throw error;
    }
  }

  static populateTemplate(html, data) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const container = doc.body.firstElementChild;

    // Replace text content for data-template attributes
    Object.entries(data).forEach(([key, value]) => {
      const element = container.querySelector(`[data-template="${key}"]`);
      if (element) {
        if (key === "form" && Array.isArray(value)) {
          // Special handling for form fields
          element.innerHTML = value.map(field => `
            <div class="ccli-form-group">
              <label for="${field.id}">${field.label}</label>
              <input 
                type="${field.type || "text"}" 
                id="${field.id}" 
                name="${field.id}"
                placeholder="${field.placeholder || ""}"
                value="${field.value || ""}"
                required
                autocomplete="off"
                autocapitalize="none"
                spellcheck="false"
              />
            </div>
          `).join("");
        } else {
          element.textContent = value;
        }
      }
    });

    return container;
  }
}

class ConfirmationModal {
  constructor() {
    this.modal = null;
    this.resolvePromise = null;
    this.escapeHandler = null;
    this.enterHandler = null;
  }

  /**
   * Shows a custom confirmation dialog
   * @param {string} title - Modal title
   * @param {string} message - Confirmation message
   * @param {string} confirmText - Text for confirm button (default: "Confirm")
   * @param {string} cancelText - Text for cancel button (default: "Cancel")
   * @param {string} confirmType - Button type: "primary", "danger" (default: "primary")
   * @returns {Promise<boolean>} - Promise that resolves with true/false
   */
  async show(title, message, confirmText = "Confirm", cancelText = "Cancel", confirmType = "primary") {
    return new Promise(async (resolve) => {
      this.resolvePromise = resolve;
      await this.createModal(title, message, confirmText, cancelText, confirmType);
      this.addEventListeners();
      this.showModal();
    });
  }

  async createModal(title, message, confirmText, cancelText, confirmType) {
    this.remove();

    const html = await TemplateLoader.loadTemplate("confirmation-modal");
    const content = TemplateLoader.populateTemplate(html, {
      title,
      message,
      confirmText,
      cancelText
    });

    // Update button type
    const confirmBtn = content.querySelector("#ccli-confirm-ok");
    confirmBtn.className = `ccli-btn ccli-btn-${confirmType}`;

    this.modal = document.createElement("div");
    this.modal.id = "ccli-confirmation-modal";
    this.modal.appendChild(content);

    document.body.appendChild(this.modal);
  }

  addEventListeners() {
    // Store references for proper cleanup
    this.escapeHandler = (e) => {
      if (e.key === "Escape" && this.modal) {
        e.preventDefault();
        this.close(false);
      }
    };

    this.enterHandler = (e) => {
      if (e.key === "Enter" && this.modal) {
        e.preventDefault();
        this.close(true);
      }
    };

    // Close button
    this.modal.querySelector(".ccli-modal-close").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.close(false);
    });

    // Cancel button
    this.modal.querySelector("#ccli-confirm-cancel").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.close(false);
    });

    // Confirm button
    this.modal.querySelector("#ccli-confirm-ok").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.close(true);
    });

    // Overlay click
    this.modal.querySelector(".ccli-modal-overlay").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) {
        e.preventDefault();
        e.stopPropagation();
        this.close(false);
      }
    });

    // Keyboard events
    document.addEventListener("keydown", this.escapeHandler);
    document.addEventListener("keydown", this.enterHandler);
  }

  showModal() {
    this.modal.classList.remove("ccli-modal-hidden");
    this.modal.classList.add("ccli-modal-visible");
    // Focus confirm button
    setTimeout(() => {
      const confirmButton = this.modal.querySelector("#ccli-confirm-ok");
      if (confirmButton) confirmButton.focus();
    }, 100);
  }

  close(result) {
    if (this.resolvePromise) {
      this.resolvePromise(result);
      this.resolvePromise = null;
    }
    this.remove();
  }

  remove() {
    if (this.modal) {
      // Clean up event listeners
      if (this.escapeHandler) {
        document.removeEventListener("keydown", this.escapeHandler);
        this.escapeHandler = null;
      }
      if (this.enterHandler) {
        document.removeEventListener("keydown", this.enterHandler);
        this.enterHandler = null;
      }

      this.modal.remove();
      this.modal = null;
    }
  }
}

class App {
  constructor() {
    this.authFlow = new OAuthFlow();
    this.tokenStorage = new TokenStorage();
    this.planningCenterAPI = new PlanningCenterAPI();
    this.songSelectAPI = new SongSelectAPI();
    this.songFinder = new SongFinder();
    this.progressIndicator = new ProgressIndicator();
    this.confirmationModal = new ConfirmationModal();
  }

  async continueImportAfterAuth(pendingImport) {
    try {
      console.info(`Continuing import for song ${pendingImport.songId}...`);
      await this.performImport(pendingImport.songId, pendingImport.slug);
    } catch (error) {
      console.error("Failed to continue import after auth:", error);
      alert([
        "❌ Failed to continue import",
        "",
        "Please try importing the song again manually."
      ].join("\n"));
    }
  }

  async importSongToPlanningCenter() {
    try {
      if (!this.isCorrectPage()) {
        alert([
          "❌ Wrong page!",
          "",
          "Please navigate to a song page on CCLI SongSelect first.",
          "The URL should look like: https://songselect.ccli.com/songs/1234567/song-title"
        ].join("\n"));
        return;
      }

      const ccliSongId = this.songFinder.getSongId();
      const slug = location.pathname.split("/").pop();

      // Handle login if needed - but make it seamless
      const isTokenValid = await this.tokenStorage.isTokenValid();
      if (!isTokenValid) {
        const refreshToken = await this.tokenStorage.getRefreshToken();
        if (!refreshToken) {
          // Store pending import before showing login
          await this.tokenStorage.setPendingImport(ccliSongId, slug);

          // Start login immediately without asking
          console.info("🔐 Authentication required, starting login flow...");
          this.authFlow.startLogin();
          return;
        }

        try {
          await this.authFlow.refreshToken();
        } catch (err) {
          console.error("Failed to refresh token:", err);

          // Store pending import before re-authentication
          await this.tokenStorage.setPendingImport(ccliSongId, slug);

          console.info("🔐 Token refresh failed, starting login flow...");
          this.authFlow.startLogin();
          return;
        }
      }

      // Clear any pending import since we"re proceeding directly
      await this.tokenStorage.clearPendingImport();

      // Proceed with import
      await this.performImport(ccliSongId, slug);

    } catch (error) {
      console.error("Import initiation failed:", error);
      await this.tokenStorage.clearPendingImport();
      alert(`❌ Failed to start import: ${error.message}`);
    }
  }

  async performImport(ccliSongId, slug) {
    let progress = null;

    try {
      // Start progress indicator
      progress = this.progressIndicator;
      progress.show("Importing Song to Planning Center", 7);

      // Step 1: Get song details
      progress.updateProgress(1, "Getting song information...", "Reading CCLI song data");
      const songDetails = await this.songSelectAPI.fetchSongDetails(ccliSongId, slug);

      // Step 2: Check if song exists
      progress.updateProgress(2, "Checking Planning Center...", "Looking for existing song");
      const existingSong = await this.planningCenterAPI.findSongById(ccliSongId).catch(console.debug);

      if (existingSong && !await this.confirmSongUpdate()) {
        progress.close();
        return;
      }

      // Step 3: Create or get song
      let songId;
      if (existingSong) {
        progress.updateProgress(3, "Using existing song...", `Found: ${songDetails.title}`);
        songId = existingSong.id;
      } else {
        progress.updateProgress(3, "Creating new song...", `Adding: ${songDetails.title}`);
        songId = await this.createNewSong(ccliSongId, songDetails);
        if (!songId) {
          progress.setError("Failed to create song", "Could not add song to Planning Center");
          return;
        }
      }

      // Step 4: Get arrangement
      progress.updateProgress(4, "Setting up arrangement...", "Configuring song structure");
      const arrangementId = await this.getArrangementId(songId, songDetails);
      if (!arrangementId) {
        progress.setError("Failed to get arrangement", "Could not access song arrangement");
        return;
      }

      // Step 5: Update with ChordPro
      progress.updateProgress(5, "Downloading ChordPro...", "Getting chord charts from CCLI");
      if (!await this.updateArrangementWithChordPro(songId, arrangementId, songDetails)) {
        progress.setError("Failed to update chords", "Could not download or apply chord chart");
        return;
      }

      // Step 6: Setup keys
      progress.updateProgress(6, "Setting up keys...", `Configuring key: ${songDetails.key}`);
      await this.ensureArrangementKeyExists(songId, arrangementId, songDetails.key);

      // Step 7: Upload additional files
      progress.updateProgress(7, "Uploading additional files...", "Adding leadsheets and vocal sheets");
      await this.uploadLeadsheetIfAvailable(songDetails, songId, arrangementId);
      await this.uploadVocalSheetIfAvailable(songDetails, songId, arrangementId);

      progress.setSuccess("Song imported successfully!", `${songDetails.title} is now available in Planning Center`);

    } catch (error) {
      console.error("Import failed:", error);

      let errorMessage = "Import failed";
      let errorDetails = error.message;

      if (error.message.includes("No song found")) {
        errorMessage = "Song not found";
        errorDetails = "This song is not in your Planning Center library yet, but the import will create it.";
      } else if (error.message.includes("401") || error.message.includes("Unauthorized")) {
        errorMessage = "Authentication failed";
        errorDetails = "Please try the import again to re-authenticate.";
      } else if (error.message.includes("403") || error.message.includes("Forbidden")) {
        errorMessage = "Permission denied";
        errorDetails = `You don"t have permission to add songs to Planning Center. Please check with your administrator.`;
      }

      if (progress) {
        progress.setError(errorMessage, errorDetails);
      } else {
        alert(`❌ ${errorMessage}: ${errorDetails}`);
      }
    }
  }

  async confirmSongUpdate() {
    console.info("Song already exists in Planning Center.");

    const title = "Song Already Exists";
    const message = "This song already exists in Planning Center. Do you want to update the default arrangement with the current ChordPro and leadsheet?";

    return await this.confirmationModal.show(
      title,
      message,
      "Update Song",
      "Cancel",
      "primary"
    );
  }

  async createNewSong(ccliSongId, songDetails) {
    try {
      const createdSong = await this.planningCenterAPI.addSong(ccliSongId, songDetails);
      console.info("✅ Song added to Planning Center!");

      if (!createdSong.id) {
        throw new Error("Song ID is missing.");
      }

      return createdSong.id;
    } catch (error) {
      console.error("Failed to add song:", error);
      throw new Error("Failed to add song to Planning Center");
    }
  }

  async getArrangementId(songId, songDetails) {
    try {
      const existingArrangements = await this.planningCenterAPI.getArrangements(songId);

      if (!existingArrangements || existingArrangements.length === 0) {
        throw new Error("No arrangements found for this song.");
      }

      const arrangementId = existingArrangements[0].id;

      if (!arrangementId || !songDetails.key) {
        throw new Error("Arrangement ID or key is missing.");
      }

      console.info("✅ Arrangement found in Planning Center!");
      return arrangementId;
    } catch (err) {
      console.error("Failed to fetch arrangements:", err);
      throw new Error("Failed to fetch song arrangements");
    }
  }

  async updateArrangementWithChordPro(songId, arrangementId, songDetails) {
    try {
      const chordProResponse = await this.songSelectAPI.fetchChordProText(songDetails);
      console.info("✅ ChordPro text fetched successfully.");

      await this.planningCenterAPI.updateArrangement(
        songId,
        arrangementId,
        songDetails.key,
        chordProResponse.toPlanningCenter(),
        songDetails.bpm
      );

      console.info("✅ Arrangement updated in Planning Center!");
      return true;
    } catch (err) {
      console.error("Failed to update arrangement with ChordPro:", err);
      throw new Error("Failed to update arrangement with ChordPro");
    }
  }

  async ensureArrangementKeyExists(songId, arrangementId, key) {
    try {
      const existingKeys = await this.planningCenterAPI.getArrangementKeys(songId, arrangementId);

      if (existingKeys && existingKeys.length > 0) {
        console.info("Existing keys found in Planning Center.");
        const existingKey = existingKeys.find(k => k.attributes.starting_key === key);

        if (existingKey) {
          return existingKey;
        }
      }

      console.info("No existing key found. Adding default key...");
      const newKey = await this.planningCenterAPI.addArrangementKey(songId, arrangementId, key);
      console.info("✅ Added default key for arrangement:", key);
      return newKey;
    } catch (error) {
      console.warn("Failed to add default key:", error);
      // Non-fatal error, continue
      return null;
    }
  }

  async uploadLeadsheetIfAvailable(songDetails, songId, arrangementId) {
    if (!this.isProductAvailable(songDetails.products.lead)) {
      console.info("Vocal sheet is unavailable for this song.");
      return;
    }

    try {
      const leadsheetBlob = await this.songSelectAPI.downloadLeadsheet(songDetails);
      console.info("✅ Leadsheet downloaded successfully.");

      await this.planningCenterAPI.uploadLeadsheet(
        songDetails,
        songId,
        arrangementId,
        leadsheetBlob
      );

      console.info("✅ Leadsheet uploaded successfully.");
    } catch (error) {
      console.warn("Failed to handle leadsheet:", error);
      // Non-fatal error, continue
    }
  }

  /**
   * Uploads a vocal sheet PDF to Planning Center if available
   * @param {SongDetails} songDetails 
   * @param {number} songId 
   * @param {number} arrangementId 
   * @returns 
   */
  async uploadVocalSheetIfAvailable(songDetails, songId, arrangementId) {
    if (!this.isProductAvailable(songDetails.products.vocal)) {
      console.info("Vocal sheet is unavailable for this song.");
      return;
    }

    try {
      const vocalSheetBlob = await this.songSelectAPI.downloadVocalSheet(songDetails);
      console.info("✅ Vocal sheet downloaded successfully.");

      await this.planningCenterAPI.uploadVocalSheet(
        songDetails,
        songId,
        arrangementId,
        vocalSheetBlob
      );

      console.info("✅ Vocal sheet uploaded successfully.");
    } catch (error) {
      console.warn("Failed to handle vocal sheet:", error);
    }
  }

  /**
   * Checks if a song product is available to be downloaded
   * @param {SongProduct} product 
   * @returns {boolean} true if the product is available to be downloaded
   */
  isProductAvailable(product) {
    if (!product.exists) {
      console.debug("No product available for this song.");
      return false;
    }

    if (!product.authorized) {
      console.warn(`Unauthorized to download product: ${product.noAuthReason}`);
      return false;
    }

    if (product.exceededMaxUniqueSongCount) {
      console.warn("Exceeded maximum unique song count.");
      return false;
    }

    console.debug("Product is available and authorized.");

    return true;
  }

  isCorrectPage() {
    return location.pathname.startsWith("/songs");
  }

  run() {
    this.authFlow.init();
    this.authFlow.setAuthCompleteCallback((pendingImport) => {
      this.continueImportAfterAuth(pendingImport);
    });

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request) => {
      if (request.action === "import_song") {
        this.importSongToPlanningCenter();
      }
      return Promise.resolve();
    });
  }
}

// Initialize the app
const app = new App();
app.run();

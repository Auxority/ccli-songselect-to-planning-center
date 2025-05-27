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
// @grant       GM_download
// @grant       GM_getResourceText
// @grant       GM_addStyle
// @version     0.11.0
// @author      aux
// @resource    customCSS https://raw.githubusercontent.com/Auxority/ccli-songselect-to-planning-center/style.css
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

class CredentialModal {
  constructor() {
    this.modal = null;
    this.resolvePromise = null;
  }

  /**
   * Shows a custom modal for credential input
   * @param {string} title - Modal title
   * @param {string} message - Instructions message
   * @param {Array} fields - Array of field objects {id, label, type, placeholder}
   * @returns {Promise<Object>} - Promise that resolves with field values
   */
  show(title, message, fields) {
    return new Promise((resolve, reject) => {
      this.resolvePromise = resolve;
      this.createModal(title, message, fields);
      this.showModal();
    });
  }

  createModal(title, message, fields) {
    // Remove existing modal if any
    this.remove();

    this.modal = document.createElement('div');
    this.modal.id = 'ccli-credential-modal';
    this.modal.innerHTML = `
      <div class="ccli-modal-overlay">
        <div class="ccli-modal-content">
          <div class="ccli-modal-header">
            <h2>${title}</h2>
            <button class="ccli-modal-close">&times;</button>
          </div>
          <div class="ccli-modal-body">
            <div class="ccli-modal-message">${message}</div>
            <form class="ccli-modal-form" id="ccli-credential-form">
              ${fields.map(field => `
                <div class="ccli-form-group">
                  <label for="${field.id}">${field.label}</label>
                  <input 
                    type="${field.type || 'text'}" 
                    id="${field.id}" 
                    name="${field.id}"
                    placeholder="${field.placeholder || ''}"
                    required
                  />
                </div>
              `).join('')}
            </form>
          </div>
          <div class="ccli-modal-footer">
            <button type="button" class="ccli-btn ccli-btn-secondary" id="ccli-modal-cancel">Cancel</button>
            <button type="submit" form="ccli-credential-form" class="ccli-btn ccli-btn-primary">Save Credentials</button>
          </div>
        </div>
      </div>
    `;

    // Add styles
    this.addStyles();

    // Add event listeners
    this.addEventListeners();

    document.body.appendChild(this.modal);
  }

  addStyles() {
    if (document.getElementById('ccli-modal-styles')) {
      return; // Styles already added
    };

    const css = GM_getResourceText("customCSS");
    GM_addStyle(css);
  }

  addEventListeners() {
    // Close button
    this.modal.querySelector('.ccli-modal-close').addEventListener('click', () => {
      this.close(null);
    });

    // Cancel button
    this.modal.querySelector('#ccli-modal-cancel').addEventListener('click', () => {
      this.close(null);
    });

    // Overlay click
    this.modal.querySelector('.ccli-modal-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.close(null);
      }
    });

    // Form submission
    this.modal.querySelector('#ccli-credential-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const values = Object.fromEntries(formData.entries());
      this.close(values);
    });

    // Escape key
    document.addEventListener('keydown', this.handleEscapeKey.bind(this));
  }

  handleEscapeKey(e) {
    if (e.key === 'Escape' && this.modal) {
      this.close(null);
    }
  }

  showModal() {
    this.modal.style.display = 'block';
    // Focus first input
    setTimeout(() => {
      const firstInput = this.modal.querySelector('input');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  close(values) {
    if (this.resolvePromise) {
      this.resolvePromise(values);
      this.resolvePromise = null;
    }
    this.remove();
  }

  remove() {
    if (this.modal) {
      document.removeEventListener('keydown', this.handleEscapeKey.bind(this));
      this.modal.remove();
      this.modal = null;
    }
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

  async promptForCredentials() {
    const instructions = [
      "To use this extension, you need to create a Planning Center API application:",
      "",
      "1. Go to: https://api.planningcenteronline.com/oauth/applications",
      "2. Click 'New Application'",
      "3. Fill in these details:",
      "   • Name: 'CCLI SongSelect Importer' (or any name you prefer)",
      "   • Redirect URI: 'https://services.planningcenteronline.com/dashboard/0'",
      "4. Click 'Submit'",
      "5. Copy the 'Application ID' and 'Secret' from the next page",
      "",
      "You only need to do this once."
    ].join("\n");

    const modal = new CredentialModal();

    const fields = [
      {
        id: 'clientId',
        label: 'Planning Center Application ID',
        type: 'text',
        placeholder: 'Long string of letters and numbers...'
      },
      {
        id: 'clientSecret',
        label: 'Planning Center Application Secret',
        type: 'password',
        placeholder: 'Long string of letters and numbers...'
      }
    ];

    try {
      const values = await modal.show('Setup Planning Center Credentials', instructions, fields);

      if (!values) {
        return false; // User cancelled
      }

      if (!values.clientId || !values.clientId.trim()) {
        alert("❌ Application ID is required. Please try again.");
        return false;
      }

      if (!values.clientSecret || !values.clientSecret.trim()) {
        alert("❌ Application Secret is required. Please try again.");
        return false;
      }

      GM_setValue("client_id", values.clientId.trim());
      GM_setValue("client_secret", values.clientSecret.trim());

      console.info("Client ID and secret have been saved.");
      alert("✅ Credentials saved successfully! You can now import songs from CCLI SongSelect.");
      return true;

    } catch (error) {
      console.error("Error in credential prompt:", error);
      return false;
    }
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

  _onMessage(event) {
    if (event.data?.type !== "oauth_complete" || !event.data.access_token) {
      console.debug("Invalid message received:", event.data);
      return;
    }

    this.tokenStorage.saveToken(event.data);
    console.info("✅ Successfully connected to Planning Center!");
    alert("✅ Successfully connected to Planning Center! You can now import songs.");
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

    const response = await this.gmHttpClient.post(PlanningCenterAPI.FILE_UPLOAD_ENDPOINT, null, formData);
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
    this.planningCenterAPI = new PlanningCenterAPI();
    this.songSelectAPI = new SongSelectAPI();
    this.songFinder = new SongFinder();
  }

  run() {
    this.authFlow.init();
    GM_registerMenuCommand("⬇️ Import Song to Planning Center", () => this.importSongToPlanningCenter());
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

      // Handle credentials setup if needed
      if (!this.tokenStorage.hasCredentials) {
        const success = await this.tokenStorage.promptForCredentials();
        if (!success) {
          return; // User cancelled setup
        }
      }

      // Handle login if needed
      if (!this.tokenStorage.isTokenValid) {
        if (!this.tokenStorage.refreshToken) {
          // Need fresh login
          alert([
            "🔐 Authentication Required",
            "",
            "You'll be redirected to Planning Center to log in.",
            "After logging in, please try importing the song again."
          ].join("\n"));
          this.authFlow.startLogin();
          return;
        }

        // Try to refresh token
        try {
          await this.authFlow.refreshToken();
        } catch (err) {
          console.error("Failed to refresh token:", err);
          alert([
            "🔐 Login Required",
            "",
            "Your session has expired. You'll be redirected to Planning Center to log in again.",
            "After logging in, please try importing the song again."
          ].join("\n"));
          this.authFlow.startLogin();
          return;
        }
      }

      // Continue with import process
      const ccliSongId = this.songFinder.getSongId();
      const existingSong = await this.planningCenterAPI.findSongById(ccliSongId).catch(console.debug);

      // Get song details from CCLI
      const slug = location.pathname.split("/").pop();
      const songDetails = await this.songSelectAPI.fetchSongDetails(ccliSongId, slug);

      // If song exists, confirm update; otherwise create new
      if (existingSong && !await this.confirmSongUpdate()) {
        return;
      }

      const songId = existingSong?.id || await this.createNewSong(ccliSongId, songDetails);
      if (!songId) return;

      // Get or create arrangement
      const arrangementId = await this.getArrangementId(songId, songDetails);
      if (!arrangementId) return;

      // Update with ChordPro content
      if (!await this.updateArrangementWithChordPro(songId, arrangementId, songDetails)) {
        return;
      }

      // Ensure key exists
      await this.ensureArrangementKeyExists(songId, arrangementId, songDetails.key);

      // Upload leadsheet if available
      await this.uploadLeadsheetIfAvailable(songDetails, songId, arrangementId);

      // Upload vocal sheet if available
      await this.uploadVocalSheetIfAvailable(songDetails, songId, arrangementId);

      alert("✅ Song has been added to Planning Center!");
    } catch (error) {
      console.error("Import failed:", error);

      // Provide more helpful error messages
      let userMessage = "❌ Import failed: ";
      if (error.message.includes("No song found")) {
        userMessage += "This song is not in your Planning Center library yet, but the import will create it.";
      } else if (error.message.includes("401") || error.message.includes("Unauthorized")) {
        userMessage += "Authentication failed. Please try the import again to re-authenticate.";
      } else if (error.message.includes("403") || error.message.includes("Forbidden")) {
        userMessage += "You don't have permission to add songs to Planning Center. Please check with your administrator.";
      } else {
        userMessage += error.message;
      }

      alert(userMessage);
    }
  }

  async confirmSongUpdate() {
    console.info("Song already exists in Planning Center.");
    return confirm("This song already exists in Planning Center. Do you want to update the default arrangement with the current ChordPro and leadsheet?");
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
      alert("❌ Failed to add song.");
      return null;
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
      alert("❌ Failed to fetch arrangements.");
      return null;
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
      alert("❌ Failed to update arrangement with ChordPro.");
      return false;
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
}

const app = new App();
app.run();

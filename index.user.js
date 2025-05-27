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
// @grant       GM_addStyle
// @version     0.11.0
// @author      aux
// @downloadURL https://github.com/Auxority/ccli-songselect-to-planning-center/raw/refs/heads/main/index.user.js
// @updateURL https://github.com/Auxority/ccli-songselect-to-planning-center/raw/refs/heads/main/index.user.js
// ==/UserScript==

GM_addStyle(`
#ccli-credential-modal, #ccli-confirmation-modal, #ccli-progress-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 999999;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.ccli-modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ccli-fadeIn 0.2s ease-out;
  z-index: 1;
}

.ccli-modal-content {
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow: hidden;
  animation: ccli-slideIn 0.3s ease-out;
  position: relative;
  z-index: 2;
}

.ccli-modal-header {
  padding: 24px 24px 16px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ccli-modal-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #111827;
}

.ccli-modal-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6b7280;
  padding: 4px;
  border-radius: 6px;
  transition: all 0.2s;
  line-height: 1;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ccli-modal-close:hover {
  background: #f3f4f6;
  color: #374151;
}

.ccli-modal-body {
  padding: 20px 24px;
}

.ccli-modal-message {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
  font-size: 14px;
  line-height: 1.5;
  color: #0c4a6e;
  white-space: pre-line;
}

.ccli-form-group {
  margin-bottom: 20px;
}

.ccli-form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: #374151;
  font-size: 14px;
}

.ccli-form-group input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}

.ccli-form-group input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.ccli-modal-footer {
  padding: 16px 24px 24px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.ccli-btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  display: inline-block;
  text-align: center;
  text-decoration: none;
  user-select: none;
  vertical-align: middle;
}

.ccli-btn-primary {
  background: #3b82f6;
  color: white;
}

.ccli-btn-primary:hover {
  background: #2563eb;
}

.ccli-btn-secondary {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
}

.ccli-btn-secondary:hover {
  background: #e5e7eb;
}

.ccli-progress-container {
  text-align: center;
}

.ccli-progress-bar-bg {
  width: 100%;
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 16px;
}

.ccli-progress-bar {
  height: 100%;
  background: #3b82f6;
  border-radius: 4px;
  width: 0%;
  transition: width 0.3s ease, background-color 0.3s ease;
}

.ccli-progress-bar.error {
  background-color: #dc3545;
}

.ccli-progress-bar.success {
  background-color: #28a745;
}

.ccli-progress-bar.complete {
  width: 100%;
}

.ccli-progress-status {
  font-size: 16px;
  font-weight: 500;
  color: #111827;
  margin-bottom: 8px;
}

.ccli-progress-details {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 16px;
}

.ccli-confirmation-content .ccli-modal-body {
  text-align: center;
}

.ccli-confirmation-message {
  font-size: 16px;
  color: #374151;
  margin-bottom: 24px;
  line-height: 1.5;
}

.ccli-confirmation-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
  align-items: center;
  position: relative;
  z-index: 1;
}

.ccli-confirmation-buttons .ccli-btn {
  min-width: 100px;
}

.ccli-btn-danger {
  background: #dc3545;
  color: white;
}

.ccli-btn-danger:hover {
  background: #c82333;
}

.ccli-modal-hidden {
  display: none;
}

.ccli-modal-visible {
  display: block;
}
`);

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

    this.modal = document.createElement("div");
    this.modal.id = "ccli-credential-modal";
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
                    type="${field.type || "text"}" 
                    id="${field.id}" 
                    name="${field.id}"
                    placeholder="${field.placeholder || ""}"
                    required
                  />
                </div>
              `).join("")}
            </form>
          </div>
          <div class="ccli-modal-footer">
            <button type="button" class="ccli-btn ccli-btn-secondary" id="ccli-modal-cancel">Cancel</button>
            <button type="submit" form="ccli-credential-form" class="ccli-btn ccli-btn-primary">Save Credentials</button>
          </div>
        </div>
      </div>
    `;

    // Add event listeners
    this.addEventListeners();

    document.body.appendChild(this.modal);
  }

  addEventListeners() {
    // Close button
    this.modal.querySelector(".ccli-modal-close").addEventListener("click", () => {
      this.close(null);
    });

    // Cancel button
    this.modal.querySelector("#ccli-modal-cancel").addEventListener("click", () => {
      this.close(null);
    });

    // Overlay click
    this.modal.querySelector(".ccli-modal-overlay").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) {
        this.close(null);
      }
    });

    // Form submission
    this.modal.querySelector("#ccli-credential-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const values = Object.fromEntries(formData.entries());
      this.close(values);
    });

    // Escape key
    document.addEventListener("keydown", this.handleEscapeKey.bind(this));
  }

  handleEscapeKey(e) {
    if (e.key === "Escape" && this.modal) {
      this.close(null);
    }
  }

  showModal() {
    this.modal.classList.remove('ccli-modal-hidden');
    this.modal.classList.add('ccli-modal-visible');
    // Focus first input
    setTimeout(() => {
      const firstInput = this.modal.querySelector("input");
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
      document.removeEventListener("keydown", this.handleEscapeKey.bind(this));
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

  saveClientId(clientId) {
    GM_setValue(TokenStorage.CLIENT_ID_KEY, clientId);
  }

  saveClientSecret(clientSecret) {
    GM_setValue(TokenStorage.CLIENT_SECRET_KEY, clientSecret);
  }

  async promptForCredentials() {
    const instructions = [
      "To use this extension, you need to create a Planning Center API application:",
      "",
      "1. Go to: https://api.planningcenteronline.com/oauth/applications",
      `2. Click "New Application"`,
      `3. Fill in these details:`,
      `   • Name: "CCLI SongSelect Importer" (or any name you prefer)`,
      `   • Redirect URI: "${OAuthClient.CONFIG.REDIRECT_URI}"`,
      `4. Click "Submit"`,
      `5. Copy the "Application ID" and "Secret" from the next page`,
      "",
      "After saving, you'll be redirected to Planning Center to authorize the application."
    ].join("\n");

    const modal = new CredentialModal();

    const fields = [
      {
        id: "clientId",
        label: "Planning Center Application ID",
        type: "text",
        placeholder: "Long string of letters and numbers..."
      },
      {
        id: "clientSecret",
        label: "Planning Center Application Secret",
        type: "password",
        placeholder: "Long string of letters and numbers..."
      }
    ];

    try {
      const values = await modal.show("Setup Planning Center Credentials", instructions, fields);

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

      this.saveClientId(values.clientId.trim());
      this.saveClientSecret(values.clientSecret.trim());

      console.info("Client ID and secret have been saved.");
      
      return true;

    } catch (error) {
      console.error("Error in credential prompt:", error);
      return false;
    }
  }

  async promptForReAuthentication() {
    const modal = new CredentialModal();

    const fields = [
      {
        id: "clientId",
        label: "Planning Center Application ID",
        type: "text",
        placeholder: "Long string of letters and numbers...",
        value: this.clientId,
      },
      {
        id: "clientSecret",
        label: "Planning Center Application Secret",
        type: "password",
        placeholder: "Long string of letters and numbers...",
        value: this.clientSecret,
      }
    ];

    try {
      const values = await modal.show("Re-authenticate with Planning Center", "Please enter your Planning Center credentials to continue.", fields);

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

      TokenStorage.saveClientId(values.clientId.trim());
      TokenStorage.saveClientSecret(values.clientSecret.trim());

      console.info("Client ID and secret have been saved.");
      
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
    this.progressBar.classList.remove('error', 'success', 'complete');
    this.progressBar.style.width = `${percentage}%`;
    this.statusText.textContent = statusText;
    this.detailsText.textContent = detailsText;
  }

  setError(errorText, detailsText = "") {
    if (!this.modal) {
      return;
    }

    this.progressBar.classList.add('error');
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

    this.progressBar.classList.add('success', 'complete');
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
    this.modal.classList.remove('ccli-modal-hidden');
    this.modal.classList.add('ccli-modal-visible');
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
  show(title, message, confirmText = "Confirm", cancelText = "Cancel", confirmType = "primary") {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.createModal(title, message, confirmText, cancelText, confirmType);
      this.showModal();
    });
  }

  createModal(title, message, confirmText, cancelText, confirmType) {
    this.remove();

    this.modal = document.createElement("div");
    this.modal.id = "ccli-confirmation-modal";
    this.modal.innerHTML = `
      <div class="ccli-modal-overlay">
        <div class="ccli-modal-content ccli-confirmation-content">
          <div class="ccli-modal-header">
            <h2>${title}</h2>
            <button class="ccli-modal-close">&times;</button>
          </div>
          <div class="ccli-modal-body">
            <div class="ccli-confirmation-message">${message}</div>
            <div class="ccli-confirmation-buttons">
              <button type="button" class="ccli-btn ccli-btn-secondary" id="ccli-confirm-cancel">${cancelText}</button>
              <button type="button" class="ccli-btn ccli-btn-${confirmType}" id="ccli-confirm-ok">${confirmText}</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.addEventListeners();
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
    this.modal.classList.remove('ccli-modal-hidden');
    this.modal.classList.add('ccli-modal-visible');
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

  run() {
    this.authFlow.init();
    GM_registerMenuCommand("⬇️ Import Song to Planning Center", () => this.importSongToPlanningCenter());
  }

  async importSongToPlanningCenter() {
    let progress = null;

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
        
        // After saving credentials, show OAuth popup
        alert([
          "✅ Credentials saved!",
          "",
          "Now you'll be redirected to Planning Center to authorize the application.",
          "After authorization, please try importing the song again."
        ].join("\n"));
        
        this.authFlow.startLogin();
        return;
      }

      // Handle login if needed
      if (!this.tokenStorage.isTokenValid) {
        if (!this.tokenStorage.refreshToken) {
          alert([
            "🔐 Authentication Required",
            "",
            `You'll be redirected to Planning Center to log in.`,
            `After logging in, please try importing the song again.`
          ].join("\n"));
          this.authFlow.startLogin();
          return;
        }

        try {
          await this.authFlow.refreshToken();
        } catch (err) {
          console.error("Failed to refresh token:", err);
          alert([
            "🔐 Login Required",
            "",
            `Your session has expired. You'll be redirected to Planning Center to log in again.`,
            "After logging in, please try importing the song again."
          ].join("\n"));
          this.authFlow.startLogin();
          return;
        }
      }

      // Start progress indicator
      progress = this.progressIndicator;
      progress.show("Importing Song to Planning Center", 7);

      // Step 1: Get song details
      progress.updateProgress(1, "Getting song information...", "Reading CCLI song data");
      const ccliSongId = this.songFinder.getSongId();
      const slug = location.pathname.split("/").pop();
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
        errorDetails = "You don't have permission to add songs to Planning Center. Please check with your administrator.";
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
}

const app = new App();
app.run();

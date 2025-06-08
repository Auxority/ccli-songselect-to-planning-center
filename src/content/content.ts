import browser from "webextension-polyfill";

// Browser extension storage wrapper
class ExtensionStorage {
  static async getValue(key: string, defaultValue: any = null): Promise<any> {
    return new Promise((resolve) => {
      browser.storage.local.get({ [key]: defaultValue }).then((result) => {
        resolve(result[key]);
      });
    });
  }

  static async setValue(key: string, value: any): Promise<void> {
    return browser.storage.local.set({ [key]: value });
  }

  static async deleteValue(key: string): Promise<void> {
    return browser.storage.local.remove(key);
  }
}

type FormDataEntries = Record<string, any>;

// HTTP Client for extension
class ExtensionHttpClient {
  constructor() {}

  async get(url: string, headers = {}): Promise<any> {
    return this.performRequest("GET", url, headers);
  }

  async post(url: string, headers = {}, data: any = null): Promise<any> {
    return this.performRequest("POST", url, headers, data);
  }

  async patch(url: string, headers = {}, data: any = null): Promise<any> {
    return this.performRequest("PATCH", url, headers, data);
  }

  async performRequest(
    method: string,
    url: string,
    headers = {},
    rawData = null
  ): Promise<any> {
    const data = await this.getSerializedData(rawData);

    // Send request to background script to bypass CORS
    try {
      const response: any = await browser.runtime.sendMessage({
        action: "http_request",
        method,
        url,
        headers,
        data,
      });

      if (response && response.error) {
        throw new Error(response.error);
      }

      return response;
    } catch (error) {
      throw error;
    }
  }

  async getSerializedData(rawData?: FormData | string | null): Promise<any> {
    if (!rawData) {
      return null;
    }

    if (rawData instanceof FormData) {
      return await this.serializeFormData(rawData);
    }

    return rawData;
  }

  async serializeFormData(formData: FormData): Promise<any> {
    this._validateFormData(formData);
    return await this._serializeUsingIterator(formData);
  }

  _validateFormData(formData: FormData) {
    if (!formData) {
      throw new Error("FormData is null or undefined");
    }

    if (!(formData instanceof FormData)) {
      console.error("Object is not a FormData instance:", formData);
      throw new Error("Object passed is not a FormData instance");
    }
  }

  async _serializeUsingIterator(formData: FormData) {
    const formDataEntries: FormDataEntries = {};

    const iterator = formData.entries();
    let result = iterator.next();

    while (!result.done) {
      const [key, value] = result.value;
      formDataEntries[key] = await this._serializeFormValue(value);
      result = iterator.next();
    }

    console.debug(
      "Successfully serialized FormData entries:",
      Object.keys(formDataEntries)
    );
    return { type: "formData", entries: formDataEntries };
  }

  async _serializeFormValue(value: unknown) {
    if (value instanceof File || value instanceof Blob) {
      const arrayBuffer = await value.arrayBuffer();
      const fileName = value instanceof File ? value.name : "file";

      return {
        type: "file",
        name: fileName,
        data: Array.from(new Uint8Array(arrayBuffer)),
        contentType: value.type,
      };
    } else {
      return { type: "string", data: value };
    }
  }
}

// Copy all classes from userscript but modify GM_ functions
class IntegerParser {
  /**
   * Parses a valid finite integer from a string
   * @param {string} value a string representing an integer
   * @returns the string converted to an integer
   */
  parse(value: string) {
    const numberValue = parseFloat(value);

    const isValid = !isNaN(numberValue) && isFinite(numberValue);
    if (!isValid || parseInt(value) !== numberValue) {
      throw new TypeError(`Given value ${value} is not a valid finite integer`);
    }

    return numberValue;
  }
}

class SongFinder {
  static EXPECTED_PART_COUNT = 4;
  static PATHNAME_SEPARATOR = "/";
  integerParser: IntegerParser;

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
      throw new Error(
        `Actual pathname part count ${parts.length} does not match expected part count of ${SongFinder.EXPECTED_PART_COUNT}`
      );
    }

    return parts[2];
  }
}

class ChordProResponse {
  static SECTION_DELIMITER_PATTERN = /\r?\n\r?\n/;
  static SECTION_DELIMITER = "\n\n";
  rawText: string;

  constructor(rawText: string) {
    this.rawText = rawText;
  }

  toPlanningCenter(): string {
    // Split the text into sections based on double newlines
    const sections = this.rawText.split(
      ChordProResponse.SECTION_DELIMITER_PATTERN
    );

    // Remove copyright from the sections (PlanningCenter includes these)
    const modifiedSections = sections.slice(1, -1);
    const songText = modifiedSections.join(ChordProResponse.SECTION_DELIMITER);

    // Converts section headers to PlanningCenter"s format
    const formattedComments = songText.replace(
      /\{comment: (.*?)\}/g,
      "<b>$1</b>\n"
    );

    // Ensure spacing between adjacent chord brackets
    const consistentSpacing = formattedComments
      .replaceAll("][", "] [")
      .replaceAll("](", "] (");

    // Remove any redundant whitespace from the beginning or end of the chords
    return consistentSpacing.trim();
  }
}

class SongSelectAPI {
  static BASE_URL = "https://songselect.ccli.com/api";
  static CHORD_NOTATION = "Standard";
  static CHORD_COLUMNS = 1;

  constructor() {}

  /**
   * Fetches and parses the song details from CCLI SongSelect
   */
  async fetchSongDetails(
    pendingImport: PendingCcliImport
  ): Promise<CCLISongDetails> {
    const songId = pendingImport.songId;
    const slug = pendingImport.slug;
    const url = `${SongSelectAPI.BASE_URL}/GetSongDetails?songNumber=${songId}&slug=${slug}`;
    const res = await fetch(url);
    const json = await res.json();
    return CCLISongDetails.deserialize(json.payload);
  }

  /**
   * Fetches the contents of the ChordPro file from SongSelect
   * @param {CCLISongDetails} songDetails
   * @returns {Promise<ChordProResponse>} the ChordPro file content
   */
  async fetchChordProText(
    songDetails: CCLISongDetails
  ): Promise<ChordProResponse> {
    if (!songDetails.products.chordPro.exists) {
      throw new Error(
        "This song does not have a ChordPro file available on CCLI."
      );
    }

    const parameters = this.createChordProParameters(songDetails);
    const url = `${
      SongSelectAPI.BASE_URL
    }/GetSongChordPro?${parameters.toString()}`;
    const res = await fetch(url);
    const data = await res.json();

    const payload = data.payload;
    if (payload === undefined || payload === "") {
      throw new Error(`Missing Chord Pro payload in response data: ${data}`);
    }

    const rawText = payload.trimStart();
    if (!rawText || rawText.trim() === "") {
      throw new Error(
        "The ChordPro file does not seem to be available on CCLI."
      );
    }

    return new ChordProResponse(rawText);
  }

  /**
   * Creates URL Search Parameters from song details
   */
  createChordProParameters(songDetails: CCLISongDetails): URLSearchParams {
    return new URLSearchParams({
      songNumber: songDetails.id.toString(),
      key: songDetails.key,
      style: SongSelectAPI.CHORD_NOTATION,
      columns: SongSelectAPI.CHORD_COLUMNS.toString(),
    });
  }

  /**
   * Downloads a leadsheet from SongSelect
   */
  async downloadLeadsheet(songDetails: CCLISongDetails): Promise<Blob> {
    if (!songDetails.products.lead.exists) {
      throw new Error("This song does not have a leadsheet available on CCLI.");
    }

    const parameters = this.createLeadsheetParameters(songDetails);
    const url = `${
      SongSelectAPI.BASE_URL
    }/GetSongLeadPdf?${parameters.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download leadsheet: ${response.statusText}`);
      }

      const pdfBlob = await response.blob();
      if (pdfBlob.size === 0) {
        throw new Error(
          "Attempted to donload a leadsheet without it being available on CCLI."
        );
      }

      return pdfBlob;
    } catch (error) {
      throw new Error(`Error downloading leadsheet: ${error}`);
    }
  }

  /**
   * Create leadsheet parameters for the API request
   */
  createLeadsheetParameters(songDetails: CCLISongDetails): URLSearchParams {
    return new URLSearchParams({
      songNumber: songDetails.id.toString(),
      key: songDetails.key,
      style: SongSelectAPI.CHORD_NOTATION,
      columns: SongSelectAPI.CHORD_COLUMNS.toString(),
      octave: "0",
      noteSize: "0",
      orientation: "Portrait",
      paperSize: "A4",
      activityType: "downloaded",
      renderer: "legacy",
    });
  }

  /**
   * Downloads a vocal sheet from SongSelect
   */
  async downloadVocalSheet(songDetails: CCLISongDetails): Promise<Blob> {
    if (!songDetails.products.vocal.exists) {
      throw new Error("This song does not have a leadsheet available on CCLI.");
    }

    const parameters = this.createVocalSheetParameters(songDetails);
    const url = `${
      SongSelectAPI.BASE_URL
    }/GetSongVocalPdf?${parameters.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to download vocal sheet: ${response.statusText}`
        );
      }

      const pdfBlob = await response.blob();
      if (pdfBlob.size === 0) {
        throw new Error(
          "Attempted to download a vocal sheet without it being available on CCLI."
        );
      }

      return pdfBlob;
    } catch (error) {
      throw new Error(`Error downloading vocal sheet: ${error}`);
    }
  }

  /**
   * Create vocal sheet parameters for the API request
   */
  createVocalSheetParameters(songDetails: CCLISongDetails): URLSearchParams {
    return new URLSearchParams({
      songNumber: songDetails.id.toString(),
      transposeKey: songDetails.key,
      octave: "0",
      noteSize: "0",
      orientation: "Portrait",
      paperSize: "A4",
      activityType: "downloaded",
      renderer: "legacy",
    });
  }
}

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

class TokenStorage {
  static ACCESS_TOKEN_KEY = "access_token";
  static REFRESH_TOKEN_KEY = "refresh_token";
  static EXPIRES_AT_KEY = "expires_at";
  static PENDING_IMPORT_KEY = "pending_import";
  static CODE_VERIFIER_KEY = "code_verifier";
  static TEN_MINUTES_IN_MS = 10 * 60 * 1000;

  async saveToken(tokenData: TokenData): Promise<void> {
    await ExtensionStorage.setValue(
      TokenStorage.ACCESS_TOKEN_KEY,
      tokenData.access_token
    );
    await ExtensionStorage.setValue(
      TokenStorage.REFRESH_TOKEN_KEY,
      tokenData.refresh_token
    );
    await ExtensionStorage.setValue(
      TokenStorage.EXPIRES_AT_KEY,
      Date.now() + tokenData.expires_in * 1000
    );
  }

  async saveCodeVerifier(codeVerifier: string) {
    await ExtensionStorage.setValue(
      TokenStorage.CODE_VERIFIER_KEY,
      codeVerifier
    );
  }

  async getCodeVerifier(): Promise<string> {
    const codeVerifier = await ExtensionStorage.getValue(
      TokenStorage.CODE_VERIFIER_KEY,
      null
    );

    if (!codeVerifier || typeof codeVerifier !== "string") {
      throw new Error(
        "Code verifier not found. Please restart the authentication process."
      );
    }

    return codeVerifier;
  }

  async clearCodeVerifier() {
    await ExtensionStorage.deleteValue(TokenStorage.CODE_VERIFIER_KEY);
  }

  async setPendingImport(pendingImport: PendingCcliImport) {
    const data = {
      songId: pendingImport.songId,
      slug: pendingImport.slug,
      timestamp: Date.now(),
    };
    const serializedData = JSON.stringify(data);
    await ExtensionStorage.setValue(
      TokenStorage.PENDING_IMPORT_KEY,
      serializedData
    );
  }

  async getPendingImport() {
    const rawPendingImport = await ExtensionStorage.getValue(
      TokenStorage.PENDING_IMPORT_KEY,
      null
    );

    if (!rawPendingImport) {
      return null;
    }

    try {
      const data = JSON.parse(rawPendingImport);
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
    return await ExtensionStorage.getValue(
      TokenStorage.REFRESH_TOKEN_KEY,
      null
    );
  }

  async isTokenValid() {
    const raw = await ExtensionStorage.getValue(TokenStorage.EXPIRES_AT_KEY, 0);
    const expiresAt = Number(raw);
    return Date.now() < expiresAt;
  }
}

class OAuthClient {
  static CONFIG = {
    CLIENT_ID:
      "0ee14294650bb97000608fc17e63ce8616c3728e97d3219f45156f493d410ccc",
    REDIRECT_URI: "https://services.planningcenteronline.com/dashboard/0",
    AUTH_URL: "https://api.planningcenteronline.com/oauth/authorize",
    TOKEN_URL: "https://api.planningcenteronline.com/oauth/token",
    SCOPE: "services",
  };

  tokenStorage: TokenStorage;
  httpClient: ExtensionHttpClient;

  constructor() {
    this.tokenStorage = new TokenStorage();
    this.httpClient = new ExtensionHttpClient();
  }

  async exchangeCodeForToken(code: string): Promise<void> {
    const codeVerifier = await this.tokenStorage.getCodeVerifier();
    const searchParams = this.generateTokenSearchParams(code, codeVerifier);

    console.info("🔄 Attempting to exchange code for token...");

    const response = await this.httpClient.post(
      OAuthClient.CONFIG.TOKEN_URL,
      this.headers,
      searchParams.toString()
    );
    const result = JSON.parse(response.responseText);
    await this.tokenStorage.saveToken(result);
    await this.tokenStorage.clearCodeVerifier();

    if (window.opener) {
      window.opener.postMessage(
        {
          type: "oauth_complete",
          access_token: result.access_token,
          refresh_token: result.refresh_token,
          expires_in: result.expires_in,
        },
        "*"
      );
      window.close();
    }
  }

  generateTokenSearchParams(
    code: string,
    codeVerifier: string
  ): URLSearchParams {
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

    const response = await this.httpClient
      .post(OAuthClient.CONFIG.TOKEN_URL, this.headers, searchParams.toString())
      .catch((err) => {
        console.error("🔁 Token refresh failed:", err);
        alert("Refresh token is invalid or expired. Please log in again.");
        throw new Error("Refresh request failed:", err);
      });

    this.onSuccessfulRefreshResponse(response);
  }

  generateRefreshTokenSearchParams(refreshToken: string): URLSearchParams {
    return new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: OAuthClient.CONFIG.CLIENT_ID,
    });
  }

  async onSuccessfulRefreshResponse(response: any) {
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

  async generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }
}

type PendingImportCallback = (pendingImport: PendingCcliImport) => void;

class OAuthFlow {
  static POPUP_WIDTH = 500;
  static POPUP_HEIGHT = 700;

  client: OAuthClient;
  tokenStorage: TokenStorage;
  onAuthCompleteCallback: PendingImportCallback;

  constructor() {
    this.client = new OAuthClient();
    this.tokenStorage = new TokenStorage();
    this.onAuthCompleteCallback = () => {};
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
        "The popup is needed to securely connect to Planning Center.",
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

  setAuthCompleteCallback(callback: PendingImportCallback) {
    this.onAuthCompleteCallback = callback;
  }

  async _onMessage(event: MessageEvent) {
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
      alert(
        "✅ Successfully connected to Planning Center! You can now import songs."
      );
    }
  }

  get popupFeatures() {
    return `width=${OAuthFlow.POPUP_WIDTH},height=${OAuthFlow.POPUP_HEIGHT},menubar=no,location=no,resizable=yes,scrollbars=yes,status=no`;
  }
}

class SongProduct {
  exists: boolean;
  authorized: boolean;
  noAuthReason: string;
  exceededMaxUniqueSongCount: boolean;

  constructor(
    exists = false,
    authorized = false,
    noAuthReason = "",
    exceededMaxUniqueSongCount = false
  ) {
    this.exists = exists;
    this.authorized = authorized;
    this.noAuthReason = noAuthReason;
    this.exceededMaxUniqueSongCount = exceededMaxUniqueSongCount;
  }

  static deserialize(json: any): SongProduct {
    return new SongProduct(
      json.exists,
      json.authorized,
      json.noAuthReason,
      json.exceededMaxUniqueSongCount
    );
  }
}

class SongProducts {
  general: SongProduct;
  lyrics: SongProduct;
  chords: SongProduct;
  chordPro: SongProduct;
  lead: SongProduct;
  vocal: SongProduct;
  multitracks: SongProduct;

  constructor(
    general = new SongProduct(),
    lyrics = new SongProduct(),
    chords = new SongProduct(),
    chordPro = new SongProduct(),
    lead = new SongProduct(),
    vocal = new SongProduct(),
    multitracks = new SongProduct()
  ) {
    this.general = general;
    this.lyrics = lyrics;
    this.chords = chords;
    this.chordPro = chordPro;
    this.lead = lead;
    this.vocal = vocal;
    this.multitracks = multitracks;
  }

  static deserialize(json: any) {
    return new SongProducts(
      SongProduct.deserialize(json.general),
      SongProduct.deserialize(json.lyrics),
      SongProduct.deserialize(json.chords),
      SongProduct.deserialize(json.chordPro),
      SongProduct.deserialize(json.lead),
      SongProduct.deserialize(json.vocal),
      SongProduct.deserialize(json.multitracks)
    );
  }
}

type ContentLabel = {
  label: string;
};

type Admins = string | Array<string | ContentLabel>;

type Authors = string | Array<string | ContentLabel>;

class CCLISongDetails {
  id: number;
  key: string;
  bpm: number;
  copyright: string;
  title: string;
  themes: string;
  products: SongProducts;
  admins: string[];
  authors: string[];

  constructor(
    id = 0,
    key = "C",
    bpm = 0,
    copyright = "",
    title = "",
    themes = "",
    products = new SongProducts(),
    admins: string[] = [],
    authors: string[] = []
  ) {
    this.id = id;
    this.key = key;
    this.bpm = bpm;
    this.copyright = copyright;
    this.title = title;
    this.themes = themes;
    this.products = products;
    this.admins = admins;
    this.authors = authors;
  }

  /**
   * Deserializes the JSON into a SongDetails object
   */
  static deserialize(json: any): CCLISongDetails {
    console.debug("Deserializing song details:", json);

    return new CCLISongDetails(
      json.ccliSongNumber,
      CCLISongDetails._extractDefaultKey(json.defaultKey),
      CCLISongDetails._extractBpm(json.bpm),
      json.copyrights.trim(),
      json.title.trim(),
      CCLISongDetails._extractThemes(json.themes),
      SongProducts.deserialize(json.products),
      CCLISongDetails._extractAdmins(json.administrators),
      CCLISongDetails._extractAuthors(json.authors)
    );
  }

  serializeForPlanningCenter(): object {
    return {
      data: {
        type: "Song",
        attributes: {
          title: this.title,
          admin: this.admins,
          author: this.authors,
          copyright: this.copyright,
          ccli_number: this.id,
          hidden: false,
          themes: this.themes,
        },
      },
    };
  }

  static _extractBpm(bpm?: string | number | null): number {
    if (bpm && !isNaN(Number(bpm))) {
      return Number(bpm);
    }

    return 0; // Default to 0 if bpm is not valid
  }

  static _extractAdmins(admins: Admins): string[] {
    if (Array.isArray(admins)) {
      return admins.map((a) =>
        typeof a === "string" ? a.trim() : a.label.trim()
      );
    } else if (typeof admins === "string") {
      return [admins.trim()];
    }

    return [];
  }

  static _extractAuthors(authors: Authors): string[] {
    if (Array.isArray(authors)) {
      return authors.map((a) =>
        typeof a === "string" ? a.trim() : a.label.trim()
      );
    } else if (typeof authors === "string") {
      return [authors.trim()];
    }

    return [];
  }

  static _extractDefaultKey(defaultKey: string[] | null | undefined): string {
    return Array.isArray(defaultKey) && defaultKey.length > 0
      ? defaultKey[0]
      : "C";
  }

  static _extractThemes(themes: any): string {
    const themeList = Array.isArray(themes)
      ? themes.map((t) => (typeof t === "string" ? t : t.label))
      : [];
    return themeList.length > 0 ? themeList.join(", ") : "";
  }
}

/**
 * Represents the attributes of a file in Planning Center
 * @param {string} name - The name of the file
 * @param {string} contentType - The content type of the file
 * @param {number} fileSize - The size of the file in bytes
 */
class FileAttributes {
  name: string;
  contentType: string;
  fileSize: number;

  constructor(name = "", contentType = "", fileSize = 0) {
    this.name = name;
    this.contentType = contentType;
    this.fileSize = fileSize;
  }

  static deserialize(json: any): FileAttributes {
    return new FileAttributes(json.name, json.content_type, json.file_size);
  }
}

class PlanningCenterFile {
  id: string;
  type: string;
  attributes: FileAttributes;

  constructor(id = "", type = "File", attributes = new FileAttributes()) {
    this.id = id;
    this.type = type;
    this.attributes = attributes;
  }

  static deserialize(json: any): PlanningCenterFile {
    if (!json || !json.id || !json.type || !json.attributes) {
      throw new Error("Invalid Planning Center file data");
    }

    return new PlanningCenterFile(
      json.id,
      json.type,
      FileAttributes.deserialize(json.attributes)
    );
  }
}

type PlanningCenterSong = {
  id: string;
  type: string;
  attributes: {
    admin: string;
    author: string;
    copyright: string;
    title: string;
    ccli_number: number;
  }
}

class PlanningCenterAPI {
  static BASE_URL = "https://api.planningcenteronline.com/services/v2";
  static FILE_UPLOAD_ENDPOINT =
    "https://upload.planningcenteronline.com/v2/files";

  tokenStorage: TokenStorage;
  httpClient: ExtensionHttpClient;

  constructor() {
    this.tokenStorage = new TokenStorage();
    this.httpClient = new ExtensionHttpClient();
  }

  async findSongByCcliId(ccliId: number): Promise<PlanningCenterSong> {
    const json = await this._getRequest(`/songs?where[ccli_number]=${ccliId}`);
    if (!json.data || json.data.length === 0) {
      throw new Error(`No song found with CCLI ID ${ccliId}`);
    }

    return json.data[0];
  }

  async addSong(songDetails: CCLISongDetails): Promise<any> {
    const songPayload = songDetails.serializeForPlanningCenter();
    const json = await this._postRequest("/songs", songPayload);
    return json.data;
  }

  async getArrangements(songId: number): Promise<any> {
    const json = await this._getRequest(`/songs/${songId}/arrangements`);
    return json.data;
  }

  async updateArrangement(
    songApiId: number,
    arrangementId: number,
    arrangementKey: string,
    chordPro: string,
    tempo = 0,
    lyricsEnabled = true
  ) {
    const payload = {
      data: {
        type: "Arrangement",
        attributes: {
          chord_chart_key: arrangementKey,
          lyrics_enabled: lyricsEnabled,
          chord_chart: chordPro,
          bpm: tempo,
        },
      },
    };
    return await this._patchRequest(
      `/songs/${songApiId}/arrangements/${arrangementId}`,
      payload
    );
  }

  async getArrangementKeys(
    songApiId: number,
    arrangementId: number
  ): Promise<any> {
    const json = await this._getRequest(
      `/songs/${songApiId}/arrangements/${arrangementId}/keys`
    );
    return json.data;
  }

  async addArrangementKey(
    songApiId: number,
    arrangementId: number,
    startingKey: string
  ) {
    const keysPayload = {
      data: {
        type: "Key",
        attributes: {
          name: "Default",
          starting_key: startingKey,
        },
      },
    };

    return await this._postRequest(
      `/songs/${songApiId}/arrangements/${arrangementId}/keys`,
      keysPayload
    );
  }

  /**
   * Uploads a leadsheet PDF to Planning Center
   */
  async uploadLeadsheet(
    songDetails: CCLISongDetails,
    songId: number,
    arrangementId: number,
    blob: Blob
  ) {
    const filename = this._generateFilename(songDetails, "lead");
    const file = await this._uploadFile(blob, filename);
    return await this._attachFileToArrangement(songId, arrangementId, file);
  }

  /**
   * Uploads a vocal sheet PDF to Planning Center
   */
  async uploadVocalSheet(
    songDetails: CCLISongDetails,
    songId: number,
    arrangementId: number,
    blob: Blob
  ) {
    const filename = this._generateFilename(songDetails, "vocal");
    const file = await this._uploadFile(blob, filename);
    return await this._attachFileToArrangement(songId, arrangementId, file);
  }

  /**
   * Generates a sanitized filename for uploading
   */
  _generateFilename(songDetails: CCLISongDetails, fileType: string): string {
    const sanitizedTitle = songDetails.title
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_");
    return `${sanitizedTitle}-${songDetails.key}-${fileType}.pdf`;
  }

  /**
   * Uploads a file to Planning Center"s upload service
   * @param {Blob} blob the file blob to upload
   * @param {string} filename the filename to use
   * @returns {Promise<PlanningCenterFile>} the uploaded file object
   */
  async _uploadFile(blob: Blob, filename: string): Promise<PlanningCenterFile> {
    // Validate inputs
    if (!blob || !filename) {
      throw new Error("Invalid blob or filename provided to _uploadFile");
    }

    const formData = new FormData();
    formData.append("file", blob, filename);

    // Validate FormData was created properly
    if (typeof formData.entries !== "function") {
      console.error("FormData creation failed:", formData);
      throw new Error("Failed to create valid FormData object");
    }

    try {
      const response = await this.httpClient.post(
        PlanningCenterAPI.FILE_UPLOAD_ENDPOINT,
        undefined,
        formData
      );
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Failed to upload ${filename}.`);
      }

      console.debug("File upload response:", response);

      const json = JSON.parse(response.responseText);
      if (!json.data || json.data.length === 0) {
        throw new Error(`Failed to upload ${filename}.`);
      }

      return PlanningCenterFile.deserialize(json.data[0]);
    } catch (error) {
      console.error("File upload failed:", error);
      throw new Error(`Failed to upload ${filename}: ${error}`);
    }
  }

  /**
   * Attaches an uploaded file to an arrangement
   */
  async _attachFileToArrangement(
    songId: number,
    arrangementId: number,
    file: PlanningCenterFile
  ): Promise<object> {
    const payload = {
      data: {
        type: "Attachment",
        attributes: {
          file_upload_identifier: file.id,
          filename: file.attributes.name,
        },
      },
    };

    const attachResponse = await this._postRequest(
      `/songs/${songId}/arrangements/${arrangementId}/attachments`,
      payload
    );
    if (attachResponse.status < 200 || attachResponse.status >= 300) {
      throw new Error("Failed to attach file.", attachResponse);
    }

    console.debug("File attach response:", attachResponse);
    return attachResponse;
  }

  async _getRequest(endpoint: string) {
    return this._request("GET", endpoint);
  }

  async _postRequest(endpoint: string, payload: any) {
    return this._request("POST", endpoint, payload);
  }

  async _patchRequest(endpoint: string, payload: any) {
    return this._request("PATCH", endpoint, payload);
  }

  async _request(method: string, endpoint: string, payload: any = null) {
    const url = `${PlanningCenterAPI.BASE_URL}${endpoint}`;
    const defaultHeaders = await this.getDefaultHeaders();
    let response;
    switch (method) {
      case "GET":
        response = await this.httpClient.get(url, defaultHeaders);
        break;
      case "POST":
        response = await this.httpClient.post(
          url,
          defaultHeaders,
          JSON.stringify(payload)
        );
        break;
      case "PATCH":
        response = await this.httpClient.patch(
          url,
          defaultHeaders,
          JSON.stringify(payload)
        );
        break;
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }

    return JSON.parse(response.responseText);
  }

  async getDefaultHeaders() {
    const accessToken = await this.tokenStorage.getAccessToken();
    return {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
  }
}

class ProgressIndicator {
  static AUTO_CLOSE_DELAY_IN_MS = 3000;
  modal: HTMLElement;
  progressBar: HTMLElement;
  statusText: HTMLElement;
  detailsText: HTMLElement;
  currentStep: number;
  totalSteps: number;

  constructor() {
    this.modal = document.createElement("div");
    this.progressBar = document.createElement("div");
    this.statusText = document.createElement("div");
    this.detailsText = document.createElement("div");
    this.currentStep = 0;
    this.totalSteps = 0;
  }

  show(title = "Processing...", totalSteps = 1) {
    this.totalSteps = totalSteps;
    this.currentStep = 0;
    this.createModal(title);
    this.showModal();
  }

  updateProgress(step: number, statusText: string, detailsText = "") {
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

  setError(errorText: string, detailsText = "") {
    if (!this.modal) {
      return;
    }

    this.progressBar.classList.add("error");
    this.statusText.textContent = `❌ ${errorText}`;
    this.detailsText.textContent = detailsText;

    // Add close button for errors
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.className = "ccli-btn ccli-btn-secondary";
    closeBtn.onclick = () => this.close();

    const footer = this.modal.querySelector(".ccli-modal-footer");
    if (footer) {
      footer.appendChild(closeBtn);
    }
  }

  setSuccess(successText: string, detailsText = "") {
    if (!this.modal) {
      return;
    }

    this.progressBar.classList.add("success", "complete");
    this.statusText.textContent = `✅ ${successText}`;
    this.detailsText.textContent = detailsText;

    setTimeout(() => this.close(), ProgressIndicator.AUTO_CLOSE_DELAY_IN_MS);
  }

  async createModal(title: string) {
    this.remove();

    const html = await TemplateLoader.loadTemplate("progress-modal");
    const content = TemplateLoader.populateTemplate(html, {
      title,
    });

    this.modal = document.createElement("div");
    this.modal.id = "ccli-progress-modal";
    this.modal.appendChild(content);

    // Store references to progress elements
    this.progressBar = this.modal.querySelector(
      ".ccli-progress-bar"
    ) as HTMLElement;
    this.statusText = this.modal.querySelector(
      ".ccli-progress-status"
    ) as HTMLElement;
    this.detailsText = this.modal.querySelector(
      ".ccli-progress-details"
    ) as HTMLElement;

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
    }
  }
}

class TemplateLoader {
  static cache = new Map();

  static async loadTemplate(templateName: string): Promise<string> {
    if (this.cache.has(templateName)) {
      return this.cache.get(templateName);
    }

    try {
      const url = browser.runtime.getURL(`templates/${templateName}.html`);
      const response = await fetch(url);
      const html = await response.text();
      this.cache.set(templateName, html);
      return html;
    } catch (error) {
      console.error(`Failed to load template ${templateName}:`, error);
      throw error;
    }
  }

  static populateTemplate(html: string, data: any) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const container = doc.body.firstElementChild;

    if (!container) {
      throw new Error("Template does not contain a root element.");
    }

    // Replace text content for data-template attributes
    Object.entries(data).forEach(([key, value]) => {
      const element = container.querySelector(`[data-template="${key}"]`);
      if (element) {
        if (key === "form" && Array.isArray(value)) {
        } else {
          element.textContent = String(value);
        }
      }
    });

    return container;
  }

  static clearAndPopulateFormFields(element: HTMLElement, fields: any[]) {
    // Clear existing content
    element.replaceChildren();

    fields.forEach((field) => {
      const formGroup = document.createElement("div");
      formGroup.className = "ccli-form-group";

      const label = document.createElement("label");
      label.setAttribute("for", field.id);
      label.textContent = field.label;

      const input = document.createElement("input");
      input.type = field.type || "text";
      input.id = field.id;
      input.name = field.id;
      input.placeholder = field.placeholder || "";
      input.value = field.value || "";
      input.required = true;
      input.autocomplete = "off";
      input.autocapitalize = "none";
      input.spellcheck = false;

      formGroup.appendChild(label);
      formGroup.appendChild(input);
      element.appendChild(formGroup);
    });
  }
}

class ConfirmationModal {
  modal: HTMLElement;
  resolvePromise: (result: boolean) => void;
  escapeHandler: (e: KeyboardEvent) => void;
  enterHandler: (e: KeyboardEvent) => void;

  constructor() {
    this.modal = document.createElement("div");
    this.resolvePromise = (_: boolean) => {};
    this.escapeHandler = (_: KeyboardEvent) => {};
    this.enterHandler = (_: KeyboardEvent) => {};
  }

  /**
   * Shows a custom confirmation dialog
   */
  async show(
    title: string,
    message: string,
    confirmText: string = "Confirm",
    cancelText: string = "Cancel",
    confirmType: string = "primary"
  ): Promise<boolean> {
    return new Promise(async (resolve) => {
      this.resolvePromise = resolve;
      await this.createModal(
        title,
        message,
        confirmText,
        cancelText,
        confirmType
      );
      this.addEventListeners();
      this.showModal();
    });
  }

  async createModal(
    title: string,
    message: string,
    confirmText: string,
    cancelText: string,
    confirmType: string
  ) {
    this.remove();

    const html = await TemplateLoader.loadTemplate("confirmation-modal");
    const content = TemplateLoader.populateTemplate(html, {
      title,
      message,
      confirmText,
      cancelText,
    });

    // Update button type
    const confirmBtn = content.querySelector(
      "#ccli-confirm-ok"
    ) as HTMLButtonElement;
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
    const closeButton = this.modal.querySelector(".ccli-modal-close");
    if (!closeButton) {
      console.error("Close button not found in confirmation modal.");
      return;
    }

    closeButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.close(false);
    });

    // Cancel button
    const cancelButton = this.modal.querySelector("#ccli-confirm-cancel");
    if (!cancelButton) {
      console.error("Cancel button not found in confirmation modal.");
      return;
    }

    cancelButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.close(false);
    });

    // Confirm button
    const confirmButton = this.modal.querySelector("#ccli-confirm-ok");
    if (!confirmButton) {
      console.error("Confirm button not found in confirmation modal.");
      return;
    }

    confirmButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.close(true);
    });

    // Overlay click
    const overlay = this.modal.querySelector(".ccli-modal-overlay");
    if (!overlay) {
      console.error("Modal overlay not found in confirmation modal.");
      return;
    }

    overlay.addEventListener("click", (e) => {
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
      const confirmButton = this.modal.querySelector(
        "#ccli-confirm-ok"
      ) as HTMLButtonElement;
      if (confirmButton) {
        confirmButton.focus();
      }
    }, 100);
  }

  close(result: boolean) {
    if (this.resolvePromise) {
      this.resolvePromise(result);
    }
    this.remove();
  }

  remove() {
    if (this.modal) {
      // Clean up event listeners
      if (this.escapeHandler) {
        document.removeEventListener("keydown", this.escapeHandler);
      }
      if (this.enterHandler) {
        document.removeEventListener("keydown", this.enterHandler);
      }

      this.modal.remove();
    }
  }
}

type PendingCcliImport = {
  songId: number;
  slug: string;
};

class App {
  authFlow: OAuthFlow;
  tokenStorage: TokenStorage;
  planningCenterAPI: PlanningCenterAPI;
  songSelectAPI: SongSelectAPI;
  songFinder: SongFinder;
  progressIndicator: ProgressIndicator;
  confirmationModal: ConfirmationModal;

  constructor() {
    this.authFlow = new OAuthFlow();
    this.tokenStorage = new TokenStorage();
    this.planningCenterAPI = new PlanningCenterAPI();
    this.songSelectAPI = new SongSelectAPI();
    this.songFinder = new SongFinder();
    this.progressIndicator = new ProgressIndicator();
    this.confirmationModal = new ConfirmationModal();
  }

  async continueImportAfterAuth(pendingImport: PendingCcliImport) {
    try {
      console.info(`Continuing import for song ${pendingImport.songId}...`);
      await this.performImport(pendingImport);
    } catch (error) {
      console.error("Failed to continue import after auth:", error);
      alert(
        [
          "❌ Failed to continue import",
          "",
          "Please try importing the song again manually.",
        ].join("\n")
      );
    }
  }

  async importSongToPlanningCenter() {
    try {
      if (!this.isCorrectPage()) {
        alert(
          [
            "❌ Wrong page!",
            "",
            "Please navigate to a song page on CCLI SongSelect first.",
            "The URL should look like: https://songselect.ccli.com/songs/1234567/song-title",
          ].join("\n")
        );
        return;
      }

      const ccliSongId = this.songFinder.getSongId();
      const slug = location.pathname.split("/").pop() as string;

      const pendingImport: PendingCcliImport = {
        songId: ccliSongId,
        slug,
      };

      // Handle login if needed - but make it seamless
      const isTokenValid = await this.tokenStorage.isTokenValid();
      if (!isTokenValid) {
        const refreshToken = await this.tokenStorage.getRefreshToken();
        if (!refreshToken) {
          // Store pending import before showing login
          await this.tokenStorage.setPendingImport(pendingImport);

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
          await this.tokenStorage.setPendingImport(pendingImport);

          console.info("🔐 Token refresh failed, starting login flow...");
          this.authFlow.startLogin();
          return;
        }
      }

      // Clear any pending import since we"re proceeding directly
      await this.tokenStorage.clearPendingImport();

      // Proceed with import
      await this.performImport(pendingImport);
    } catch (error) {
      console.error("Import initiation failed:", error);
      await this.tokenStorage.clearPendingImport();
      if (error instanceof Error) {
        alert(`❌ Failed to start import: ${error.message}`);
      }
    }
  }

  async performImport(pendingImport: PendingCcliImport) {
    let progress = null;

    try {
      // Start progress indicator
      progress = this.progressIndicator;
      progress.show("Importing Song to Planning Center", 7);

      // Step 1: Get song details
      progress.updateProgress(
        1,
        "Getting song information...",
        "Reading CCLI song data"
      );
      const songDetails = await this.songSelectAPI.fetchSongDetails(
        pendingImport
      );
      console.debug("Song details fetched:", songDetails);

      // Step 2: Check if song exists
      progress.updateProgress(
        2,
        "Checking Planning Center...",
        "Looking for existing song"
      );
      const existingSong = await this.planningCenterAPI
        .findSongByCcliId(pendingImport.songId)
        .catch(console.debug);
      console.debug("Existing song found:", existingSong);

      if (existingSong && !(await this.confirmSongUpdate())) {
        progress.close();
        return;
      }

      // Step 3: Create or get song
      let songId;
      if (existingSong) {
        progress.updateProgress(
          3,
          "Using existing song...",
          `Found: ${songDetails.title}`
        );
        songId = existingSong.id;
        console.debug(existingSong);
        console.debug(`Found existing song: ${existingSong.id}`);
      } else {
        progress.updateProgress(
          3,
          "Creating new song...",
          `Adding: ${songDetails.title}`
        );
        songId = await this.createNewSong(songDetails);
        if (!songId) {
          progress.setError(
            "Failed to create song",
            "Could not add song to Planning Center"
          );
          return;
        }
        console.debug(
          `No existing song found, created a new song with this ID: ${pendingImport.songId}`
        );
      }

      // Step 4: Get arrangement
      progress.updateProgress(
        4,
        "Setting up arrangement...",
        "Configuring song structure"
      );
      const arrangementId = await this.getArrangementId(songId, songDetails);
      if (!arrangementId) {
        progress.setError(
          "Failed to get arrangement",
          "Could not access song arrangement"
        );
        return;
      }
      console.debug(`Arrangement ID: ${arrangementId}`);

      // Step 5: Update with ChordPro
      progress.updateProgress(
        5,
        "Downloading ChordPro...",
        "Getting chord charts from CCLI"
      );
      if (
        !(await this.updateArrangementWithChordPro(
          songId,
          arrangementId,
          songDetails
        ))
      ) {
        progress.setError(
          "Failed to update chords",
          "Could not download or apply chord chart"
        );
        return;
      }
      console.debug("ChordPro updated successfully in Planning Center");

      // Step 6: Setup keys
      progress.updateProgress(
        6,
        "Setting up keys...",
        `Configuring key: ${songDetails.key}`
      );
      await this.ensureArrangementKeyExists(
        songId,
        arrangementId,
        songDetails.key
      );

      // Step 7: Upload additional files
      progress.updateProgress(
        7,
        "Uploading additional files...",
        "Adding leadsheet and vocal sheet if available"
      );
      await this.uploadLeadsheetIfAvailable(songDetails, songId, arrangementId);
      await this.uploadVocalSheetIfAvailable(
        songDetails,
        songId,
        arrangementId
      );

      progress.setSuccess(
        "Song imported successfully!",
        `${songDetails.title} is now available in Planning Center`
      );
    } catch (error) {
      console.error("Import failed:", error);

      let errorMessage = "Import failed";
      let errorDetails = error instanceof Error ? error.message : String(error);

      if (errorDetails.includes("No song found")) {
        errorMessage = "Song not found";
        errorDetails =
          "This song is not in your Planning Center library yet, but the import will create it.";
      } else if (
        errorDetails.includes("401") ||
        errorDetails.includes("Unauthorized")
      ) {
        errorMessage = "Authentication failed";
        errorDetails = "Please try the import again to re-authenticate.";
      } else if (
        errorDetails.includes("403") ||
        errorDetails.includes("Forbidden")
      ) {
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
    const message =
      "This song already exists in Planning Center. Do you want to update the default arrangement with the current ChordPro and leadsheet?";

    return await this.confirmationModal.show(
      title,
      message,
      "Update Song",
      "Cancel",
      "primary"
    );
  }

  async createNewSong(songDetails: CCLISongDetails) {
    try {
      const createdSong = await this.planningCenterAPI.addSong(songDetails);
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

  async getArrangementId(songId: number, songDetails: CCLISongDetails) {
    console.debug("Fetching arrangements for song ID:", songId);

    try {
      const existingArrangements = await this.planningCenterAPI.getArrangements(
        songId
      );

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
      throw new Error(`Failed to fetch song arrangements: ${err}`);
    }
  }

  async updateArrangementWithChordPro(
    songId: number,
    arrangementId: number,
    songDetails: CCLISongDetails
  ) {
    try {
      const chordProResponse = await this.songSelectAPI.fetchChordProText(
        songDetails
      );
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

  async ensureArrangementKeyExists(
    songId: number,
    arrangementId: number,
    key: string
  ) {
    try {
      const existingKeys = await this.planningCenterAPI.getArrangementKeys(
        songId,
        arrangementId
      );

      if (existingKeys && existingKeys.length > 0) {
        console.info("Existing keys found in Planning Center.");
        const existingKey = existingKeys.find(
          (k: any) => k.attributes.starting_key === key
        );

        if (existingKey) {
          return existingKey;
        }
      }

      console.info("No existing key found. Adding default key...");
      const newKey = await this.planningCenterAPI.addArrangementKey(
        songId,
        arrangementId,
        key
      );
      console.info("✅ Added default key for arrangement:", key);
      return newKey;
    } catch (error) {
      console.warn("Failed to add default key:", error);
      // Non-fatal error, continue
      return null;
    }
  }

  async uploadLeadsheetIfAvailable(
    songDetails: CCLISongDetails,
    songId: number,
    arrangementId: number
  ) {
    if (!this.isProductAvailable(songDetails.products.lead)) {
      console.info("Vocal sheet is unavailable for this song.");
      return;
    }

    try {
      const leadsheetBlob = await this.songSelectAPI.downloadLeadsheet(
        songDetails
      );
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
   */
  async uploadVocalSheetIfAvailable(
    songDetails: CCLISongDetails,
    songId: number,
    arrangementId: number
  ): Promise<void> {
    if (!this.isProductAvailable(songDetails.products.vocal)) {
      console.info("Vocal sheet is unavailable for this song.");
      return;
    }

    try {
      const vocalSheetBlob = await this.songSelectAPI.downloadVocalSheet(
        songDetails
      );
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
   */
  isProductAvailable(product: SongProduct): boolean {
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
      console.debug(`Pending import after auth:`, pendingImport);
      this.continueImportAfterAuth(pendingImport);
    });

    // Listen for messages from popup
    browser.runtime.onMessage.addListener((request: any) => {
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

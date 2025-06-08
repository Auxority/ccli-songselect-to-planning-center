import browser, { Runtime } from "webextension-polyfill";

// Background script for handling extension lifecycle and messaging

type FormDataEntry = {
  type: string;
  data: any;
  contentType?: string;
  name?: string;
};

type HttpRequest = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  data?:
    | string
    | { type: "formData"; entries: Record<string, FormDataEntry> }
    | null;
};

type HttpResponse = {
  status: number;
  statusText: string;
  responseText: string;
  headers: Record<string, string>;
};

type SerializedFormData = {
  entries: Record<string, FormDataEntry>;
};

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("CCLI SongSelect to Planning Center extension installed");
  }
});

// Handle any background tasks or message passing if needed
const listener: Runtime.OnMessageListenerCallback = (
  message: any,
  _: Runtime.MessageSender,
  sendResponse: any
) => {
  if (message.action === "http_request") {
    performHttpRequest(message)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ error: error.message }));
  } else {
    console.warn("Unknown message action:", message.action);
    sendResponse({ error: "Unknown action" });
  }
  return true;
};

browser.runtime.onMessage.addListener(listener);

async function performHttpRequest(request: HttpRequest): Promise<HttpResponse> {
  const headers: Record<string, string> = { ...request.headers };

  const options: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.data) {
    if (typeof request.data === "object" && request.data.type === "formData") {
      delete headers["Content-Type"];
      options.body = deserializeFormData(request.data);
    } else if (typeof request.data === "string") {
      options.body = request.data;
    } else {
      options.body = JSON.stringify(request.data);
    }
  }

  const response = await fetch(request.url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    status: response.status,
    statusText: response.statusText,
    responseText: await response.text(),
    headers: responseHeaders,
  };
}

function deserializeFormData(serializedData: SerializedFormData): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(serializedData.entries)) {
    if (value.type === "file") {
      const uint8Array = new Uint8Array(value.data);
      const blob = new Blob([uint8Array], { type: value.contentType });
      const fileName = value.name || "file";
      const file = new File([blob], fileName, { type: value.contentType });
      formData.append(key, file);
    } else {
      formData.append(key, value.data);
    }
  }

  return formData;
}

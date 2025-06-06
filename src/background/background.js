// Background script for handling extension lifecycle and messaging

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

browserAPI.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("CCLI SongSelect to Planning Center extension installed");
  }
});

// Handle any background tasks or message passing if needed
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "http_request") {
    performHttpRequest(request)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Indicates we will respond asynchronously
  }
  // Handle messages from content script if needed
  return Promise.resolve();
});

async function performHttpRequest({ method, url, headers = {}, data = null }) {
  const options = {
    method,
    headers: { ...headers },
  };

  if (data) {
    if (data && data.type === "formData") {
      delete options.headers["Content-Type"];
      options.body = deserializeFormData(data);
    } else if (typeof data === "string") {
      options.body = data;
    } else {
      options.body = JSON.stringify(data);
    }
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return {
    status: response.status,
    statusText: response.statusText,
    responseText: await response.text(),
    headers: Object.fromEntries(response.headers.entries())
  };
}

function deserializeFormData(serializedData) {
  const formData = new FormData();
  
  for (const [key, value] of Object.entries(serializedData.entries)) {
    if (value.type === "file") {
      const uint8Array = new Uint8Array(value.data);
      const blob = new Blob([uint8Array], { type: value.contentType });
      const file = new File([blob], value.name, { type: value.contentType });
      formData.append(key, file);
    } else {
      formData.append(key, value.data);
    }
  }
  
  return formData;
}
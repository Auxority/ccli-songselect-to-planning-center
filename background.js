// Background script for handling extension lifecycle and messaging

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("CCLI SongSelect to Planning Center extension installed");
  }
});

// Handle any background tasks or message passing if needed
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
    if (data instanceof FormData) {
      delete options.headers["Content-Type"];
      options.body = data;
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
    responseText: await response.text()
  };
}
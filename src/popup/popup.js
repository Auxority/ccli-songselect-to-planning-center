// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener("DOMContentLoaded", async () => {
  const statusDiv = document.getElementById("status");
  const statusText = document.getElementById("status-text");
  const importBtn = document.getElementById("import-btn");

  // Check connection status
  async function updateStatus() {
    try {
      const accessToken = await browserAPI.storage.local.get(["access_token"]);
      const expiresAt = await browserAPI.storage.local.get(["expires_at"]);

      if (isConnected(accessToken, expiresAt)) {
        statusDiv.className = "status connected";
        statusText.textContent = "✅ Connected to Planning Center";
      } else {
        statusDiv.className = "status disconnected";
        statusText.textContent = "🔐 Will connect when importing";
      }
    } catch (error) {
      console.error("Error checking status:", error);
    }
  }

  function isConnected(accessToken, expiresAt) {
    return accessToken.access_token
      && expiresAt.expires_at
      && Date.now() < expiresAt.expires_at;
  }

  // Import button click
  importBtn.addEventListener("click", async () => {
    try {
      const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];

      if (!currentTab.url.includes("songselect.ccli.com/songs/")) {
        alert("Please navigate to a song page on CCLI SongSelect first.");
        return;
      }

      // Send message to content script to start import
      try {
        await browserAPI.tabs.sendMessage(currentTab.id, { action: "import_song" });
        window.close();
      } catch (error) {
        if (error.message.includes("Could not establish connection")) {
          alert("Please reload this song page and try again.\n\n(The extension needs to be reloaded on existing tabs)");
        } else {
          console.error("Error starting import:", error);
          alert("Error starting import. Please try again.");
        }
      }

      window.close();
    } catch (error) {
      console.error("Error starting import:", error);
      alert("Error starting import. Please try again.");
    }
  });

  // Initialize
  await updateStatus();
});

import browser from "webextension-polyfill";

// Cross-browser compatibility
document.addEventListener("DOMContentLoaded", async () => {
  const statusDiv = document.getElementById("status");
  const statusText = document.getElementById("status-text");
  const importBtn = document.getElementById("import-btn");

  if (!statusDiv || !statusText || !importBtn) {
    console.error("Required elements not found in popup HTML");
    return;
  }

  // Check connection status
  async function updateStatus() {
    try {
      const accessToken = await browser.storage.local.get(["access_token"]);
      const expiresAt = await browser.storage.local.get(["expires_at"]);

      if (isConnected(accessToken, expiresAt)) {
        if (statusDiv && statusText) {
          statusDiv.className = "status connected";
          statusText.textContent = "✅ Connected to Planning Center";
        }
      } else {
        if (statusDiv && statusText) {
          statusDiv.className = "status disconnected";
          statusText.textContent = "🔐 Will connect when importing";
        }
      }
    } catch (error) {
      console.error("Error checking status:", error);
    }
  }

  interface AccessTokenStorage {
    access_token?: string;
  }

  interface ExpiresAtStorage {
    expires_at?: number;
  }

  function isConnected(accessToken: AccessTokenStorage, expiresAt: ExpiresAtStorage): boolean {
    return !!(
      accessToken.access_token &&
      expiresAt.expires_at &&
      Date.now() < expiresAt.expires_at
    );
  }

  // Add a function to show messages in the popup
  function showMessage(message: string, type = "info") {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message-toast ${type}`;
    messageDiv.textContent = message;

    // Add to body with fixed positioning
    document.body.appendChild(messageDiv);

    // Trigger show animation
    requestAnimationFrame(() => {
      messageDiv.classList.add("show");
    });

    // Auto-remove after a few seconds
    setTimeout(() => {
      messageDiv.classList.add("hide");

      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.parentNode.removeChild(messageDiv);
        }
      }, 300);
    }, 3000);
  }

  // Import button click
  importBtn.addEventListener("click", async () => {
    try {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const currentTab = tabs[0];

      if (!currentTab.url || !currentTab.url.includes("songselect.ccli.com/songs/")) {
        showMessage(
          "Please navigate to a song page on CCLI SongSelect.",
          "error"
        );
        return;
      }

      // Send message to content script to start import
      try {
        if (!currentTab.id) {
          showMessage("Unable to identify current tab.", "error");
          return;
        }
        
        browser.tabs.sendMessage(currentTab.id, {
          action: "import_song",
        });
        window.close();
      } catch (error) {
        if (error instanceof Error && error.message.includes("Could not establish connection")) {
          showMessage(
            "Please reload this song page and try again.\n\n(The extension needs to be reloaded on existing tabs)",
            "warning"
          );
        } else {
          console.error("Error starting import:", error);
          showMessage("Error starting import. Please try again.", "error");
        }
      }
    } catch (error) {
      console.error("Error starting import:", error);
      showMessage("Error starting import. Please try again.", "error");
    }
  });

  // Initialize
  await updateStatus();
});

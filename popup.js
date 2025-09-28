const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const langInput = document.getElementById("lang");
const overlayCheckbox = document.getElementById("overlay");

startBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const payload = {
    lang: langInput.value || "en-US",
    overlay: overlayCheckbox.checked,
  };

  // Inject the content script into the page (if not already injected)
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content_script.js"],
  });

  // Send message to content script
  chrome.tabs.sendMessage(tab.id, { __VOICE_EXT_CMD: "start_listening", payload });

  startBtn.disabled = true;
  stopBtn.disabled = false;
});

stopBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { __VOICE_EXT_CMD: "stop_listening" });
  startBtn.disabled = false;
  stopBtn.disabled = true;
});

// Optional: update popup status box when forwarding commands
function handleCommand(transcript) {
  let statusBox = document.getElementById("status");
  statusBox.innerText = `Heard: "${transcript}"`;

  if (
    transcript.includes("next tab") ||
    transcript.includes("previous tab") ||
    transcript.startsWith("switch to")
  ) {
    statusBox.style.background = "#d1ecf1";
    statusBox.style.padding = "4px";
  } else {
    statusBox.style.background = "";
  }

  // Forward command to content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        __VOICE_EXT_CMD: "command",
        payload: { text: transcript },
      });
    }
  });
}

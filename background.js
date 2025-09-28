// // background.js
// chrome.runtime.onInstalled.addListener(() => {
//   console.log("[VoiceExt] Extension installed.");
// });

// // 🔄 Re-inject after navigation
// chrome.webNavigation.onCompleted.addListener((details) => {
//   if (details.frameId === 0 && details.url.startsWith("http")) {
//     console.log("[VoiceExt] Re-injecting into:", details.url);

//     chrome.scripting.executeScript(
//       {
//         target: { tabId: details.tabId },
//         files: ["content_script.js"],
//       },
//       () => {
//         chrome.tabs.sendMessage(details.tabId, {
//           __VOICE_EXT_CMD: "start_listening",
//           payload: { lang: "en-US" },
//         });
//       }
//     );
//   }
// });

// // 🛑 Helper: stop listening in a tab
// function stopListeningInTab(tabId) {
//   chrome.tabs.sendMessage(tabId, { __VOICE_EXT_CMD: "stop_listening" });
// }

// // 🔀 Handle tab navigation
// chrome.runtime.onMessage.addListener((msg, sender) => {
//   if (
//     msg.type === "NEXT_TAB" ||
//     msg.type === "PREVIOUS_TAB" ||
//     msg.type === "SWITCH_TAB"
//   ) {
//     // stop listening in old active tab
//     chrome.tabs.query({ currentWindow: true, active: true }, (activeTabs) => {
//       if (activeTabs[0]) stopListeningInTab(activeTabs[0].id);
//     });

//     chrome.tabs.query({ currentWindow: true }, (tabs) => {
//       chrome.tabs.query({ active: true, currentWindow: true }, (active) => {
//         let idx = active[0].index;
//         let newTabId = null;

//         if (msg.type === "NEXT_TAB") {
//           newTabId = tabs[(idx + 1) % tabs.length].id;
//         } else if (msg.type === "PREVIOUS_TAB") {
//           newTabId = tabs[(idx - 1 + tabs.length) % tabs.length].id;
//         } else if (msg.type === "SWITCH_TAB" && msg.query) {
//           let target = tabs.find((t) =>
//             t.title.toLowerCase().includes(msg.query.toLowerCase())
//           );
//           if (target) newTabId = target.id;
//         }

//         if (newTabId) {
//           chrome.tabs.update(newTabId, { active: true }, () => {
//             chrome.scripting.executeScript(
//               {
//                 target: { tabId: newTabId },
//                 files: ["content_script.js"],
//               },
//               () => {
//                 chrome.tabs.sendMessage(newTabId, {
//                   __VOICE_EXT_CMD: "start_listening",
//                   payload: { lang: "en-US" },
//                 });
//               }
//             );
//           });
//         }
//       });
//     });
//   }
// });
// background.js
chrome.runtime.onInstalled.addListener(() => {
  console.log("[VoiceExt] Extension installed.");
});

// 🔗 Common site shortcuts
const siteShortcuts = {
  youtube: "https://youtube.com",
  google: "https://google.com",
  github: "https://github.com",
  gmail: "https://mail.google.com",
  reddit: "https://reddit.com",
  twitter: "https://twitter.com",
  linkedin: "https://linkedin.com",
  facebook: "https://facebook.com"
};

// 🔄 Re-inject after navigation
chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId === 0 && details.url.startsWith("http")) {
    console.log("[VoiceExt] Re-injecting into:", details.url);

    chrome.scripting.executeScript(
      {
        target: { tabId: details.tabId },
        files: ["content_script.js"],
      },
      () => {
        chrome.tabs.sendMessage(details.tabId, {
          __VOICE_EXT_CMD: "start_listening",
          payload: { lang: "en-US" },
        });
      }
    );
  }
});

// 🛑 Helper: stop listening in a tab
function stopListeningInTab(tabId) {
  chrome.tabs.sendMessage(tabId, { __VOICE_EXT_CMD: "stop_listening" });
}

// 🔀 Handle tab navigation + open tab
chrome.runtime.onMessage.addListener((msg, sender) => {
  // --- Open new tab ---
  if (msg.type === "OPEN_NEW_TAB") {
    let url = "chrome://newtab/";

    if (msg.query) {
      const query = msg.query.toLowerCase();
      if (siteShortcuts[query]) {
        // Direct match in dictionary
        url = siteShortcuts[query];
      } else {
        // Fallback → Google search
        url = `https://www.google.com/search?q=${encodeURIComponent(msg.query)}`;
      }
    }

    chrome.tabs.create({ url }, (tab) => {
      // Auto-inject listening into the new tab
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          files: ["content_script.js"],
        },
        () => {
          chrome.tabs.sendMessage(tab.id, {
            __VOICE_EXT_CMD: "start_listening",
            payload: { lang: "en-US" },
          });
        }
      );
    });
    return;
  }

  // --- Open a specific URL directly ---
  if (msg.type === "OPEN_URL" && msg.url) {
    chrome.tabs.create({ url: msg.url }, (tab) => {
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          files: ["content_script.js"],
        },
        () => {
          chrome.tabs.sendMessage(tab.id, {
            __VOICE_EXT_CMD: "start_listening",
            payload: { lang: "en-US" },
          });
        }
      );
    });
    return;
  }

  // --- Tab switching ---
  if (
    msg.type === "NEXT_TAB" ||
    msg.type === "PREVIOUS_TAB" ||
    msg.type === "SWITCH_TAB"
  ) {
    // stop listening in old active tab
    chrome.tabs.query({ currentWindow: true, active: true }, (activeTabs) => {
      if (activeTabs[0]) stopListeningInTab(activeTabs[0].id);
    });

    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (active) => {
        let idx = active[0].index;
        let newTabId = null;

        if (msg.type === "NEXT_TAB") {
          newTabId = tabs[(idx + 1) % tabs.length].id;
        } else if (msg.type === "PREVIOUS_TAB") {
          newTabId = tabs[(idx - 1 + tabs.length) % tabs.length].id;
        } else if (msg.type === "SWITCH_TAB" && msg.query) {
          let target = tabs.find((t) =>
            t.title.toLowerCase().includes(msg.query.toLowerCase())
          );
          if (target) newTabId = target.id;
        }

        if (newTabId) {
          chrome.tabs.update(newTabId, { active: true }, () => {
            chrome.scripting.executeScript(
              {
                target: { tabId: newTabId },
                files: ["content_script.js"],
              },
              () => {
                chrome.tabs.sendMessage(newTabId, {
                  __VOICE_EXT_CMD: "start_listening",
                  payload: { lang: "en-US" },
                });
              }
            );
          });
        }
      });
    });
  }
});

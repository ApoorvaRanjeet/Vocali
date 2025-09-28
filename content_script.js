// 🛡️ Prevent multiple injections
if (!window.__VOICE_EXT_CONTENT_SCRIPT_LOADED__) {
  console.log("[VoiceExt] Content script injected into", window.location.href);
  window.__VOICE_EXT_CONTENT_SCRIPT_LOADED__ = true;

  let recognition = null;
  let listening = false;
  let manualStop = false;
  let isCapsLock = false; // Initial assumption that capslock is off

  // Scroll settings
  let scrollSpeed = 5;
  let scrollDirection = 0;
  let rafId = null;

  // Zoom settings
  let currentZoom = 1;

  // -----------------------------
  // Helpers
  // -----------------------------
  function normalizeCmd(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // -----------------------------
  // Suggestion selector helper
  // -----------------------------
  // Attempts to find a suggestion/autocomplete list and click the ordinal item.
  function selectSuggestionAtOrdinal(ord) {
    const listSelectors = [
      'ul[role="listbox"] li[role="presentation"] div[role="option"]',
      'ul[role="listbox"] li[role="presentation"]',
      'ul[role="listbox"] li',
      'div[role="listbox"] div[role="option"]',
      'div[role="listbox"] li',
      'ytd-searchbox-suggestions tp-yt-paper-item',
      '.suggestions li',
      '.autocomplete-results li'
    ];

    let items = [];
    for (const sel of listSelectors) {
      const els = Array.from(document.querySelectorAll(sel)).filter((el) => {
        try {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        } catch (e) {
          return false;
        }
      });
      if (els.length) { items = els; break; }
    }

    // silently ignore if nothing found
    if (!items.length) return;

    const n = items.length;
    let idx;
    if (ord === 'first') idx = 0;
    else if (ord === 'second') idx = 1;
    else if (ord === 'third') idx = 2;
    else if (ord === 'last') idx = n - 1;
    else if (ord === 'second last') idx = n - 2;
    else return;

    if (idx < 0 || idx >= n) return;

    const el = items[idx];

    // try to click the element robustly
    try { el.click(); } catch (e) {}
    try {
      const evInit = { bubbles: true, cancelable: true, view: window };
      el.dispatchEvent(new MouseEvent('mousedown', evInit));
      el.dispatchEvent(new MouseEvent('mouseup', evInit));
      el.dispatchEvent(new MouseEvent('click', evInit));
    } catch (e) {}

    // show small confirmation (optional) — remove this line if you want truly silent selection
    showStatus(`✅ Selected ${ord} suggestion`);
  }

  // -----------------------------
  // Smooth scrolling loop
  // -----------------------------
  function scrollLoop() {
    if (scrollDirection !== 0) {
      window.scrollBy(0, scrollSpeed * scrollDirection);
      rafId = requestAnimationFrame(scrollLoop);
    }
  }

  // -----------------------------
  // Start listening
  // -----------------------------
  function startListening(lang = "en-US") {
    if (listening) return;
    listening = true;
    manualStop = false;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onstart = () => {
      console.log("[VoiceExt] Started listening…");
      showStatus("🎤 Listening started");
    };

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      console.log("[VoiceExt] Heard (raw):", transcript);
      handleCommand(transcript);
    };

    recognition.onerror = (e) => {
      console.error("[VoiceExt] Speech recognition error:", e.error);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        alert("Microphone permission denied.");
      }
    };

    recognition.onend = () => {
      console.log("[VoiceExt] Stopped listening.");
      listening = false;
      if (!manualStop) showStatus("🎤 Waiting for background to restart");
    };

    recognition.start();
  }

  // -----------------------------
  // Stop listening
  // -----------------------------
  function stopListening() {
    if (recognition && listening) {
      manualStop = true;
      recognition.stop();
    }
    listening = false;
    stopScrolling();
    showStatus("🛑 Listening stopped");
  }

  // -----------------------------
  // Command Handler
  // -----------------------------
  // -----------------------------
// Command Handler (updated)
// -----------------------------
  function handleCommand(rawCmd) {
    if (!rawCmd || typeof rawCmd !== "string") return;

    const raw = rawCmd.toLowerCase().trim();

    // 1) Convert spoken 'dot', 'period', 'point' -> '.' so "youtube dot com" => "youtube.com"
    const dotted = raw.replace(/\b(dot|period|point)\b/gi, ".").replace(/\s+/g, " ").trim();

    // 2) Domain detection regex (captures things like example.com, sub.domain.co.uk, example.com/path)
    const domainRegex = /((?:[a-z0-9-]+\.)+[a-z]{2,6}(?:\/\S*)?)/i;
    const domMatch = domainRegex.exec(dotted);

    // If user said "open ..." and dotted contains a domain, open it directly
    if ((raw.startsWith("open ") || raw.startsWith("open new tab")) && domMatch) {
      let candidate = domMatch[1];
      const url = candidate.match(/^https?:\/\//i) ? candidate : `https://${candidate}`;
      chrome.runtime.sendMessage({ type: "OPEN_URL", url });
      return;
    }

    // (If not direct domain open) continue with the rest of your command parsing:
    let cmd = normalizeCmd(rawCmd); // keep using your existing normalization for other commands

    // 🔹 Split multiple instructions into sub-commands (keeps your original splitting approach)
    const parts = cmd
      .split(/\b(?=focus|click|type|scroll|open|switch|enter|submit|clear|caps|on|off|zoom|choose|select|pick|go|with)\b/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length > 1) {
      for (let part of parts) handleCommand(part);
      return;
    }

    cmd = parts[0];
    if (!cmd) return;

    // --- (rest of your existing logic follows unchanged) ---
    // token lists
    const capsKeywords = ["caps", "capslock", "capital", "cap"];
    const onKeywords = ["on", "enable", "upper", "uppercase"];
    const offKeywords = ["off", "disable", "lower", "lowercase"];
    const directiveKeywords = [...capsKeywords, ...onKeywords, ...offKeywords];

    let tokens = cmd.split(" ").filter(Boolean);

    // ---- Process capitalization directives
    const hasCaps = tokens.some((w) => capsKeywords.includes(w));
    const hasOn = tokens.some((w) => onKeywords.includes(w));
    const hasOff = tokens.some((w) => offKeywords.includes(w));

    if (hasCaps || hasOn || hasOff || cmd === "caps" || cmd === "on" || cmd === "off") {
      if (hasCaps && hasOff) {
        isCapsLock = false;
        showStatus("⚡ CapsLock OFF");
      } else if (hasCaps && hasOn) {
        isCapsLock = true;
        showStatus("⚡ CapsLock ON");
      } else if (cmd === "caps off" || cmd === "off" || hasOff) {
        isCapsLock = false;
        showStatus("⚡ CapsLock OFF");
      } else if (cmd === "caps on" || cmd === "on" || hasOn) {
        isCapsLock = true;
        showStatus("⚡ CapsLock ON");
      } else if (cmd === "caps" || hasCaps) {
        isCapsLock = !isCapsLock;
        showStatus(`⚡ CapsLock ${isCapsLock ? "ON" : "OFF"}`);
      }
      return;
    }

    // ----- Page Navigation (Back / Forward) -----
    if (
      cmd === "go back" ||
      cmd === "previous page" ||
      cmd === "backward" ||
      cmd === "back"
    ) {
      if (window.history.length > 1) {
        window.history.back();
        showStatus("⬅️ Going back one page");
      } else {
        showStatus("⚠️ No previous page available");
      }
      return;
    }

    if (cmd === "go forward" || cmd === "next page" || cmd === "forward") {
      const prevUrl = location.href;
      window.history.forward();
      setTimeout(() => {
        if (location.href === prevUrl) showStatus("⚠️ No next page available");
        else showStatus("➡️ Going forward one page");
      }, 400);
      return;
    }

    // ----- Zoom Commands -----
    if (cmd.includes("zoom in")) {
      currentZoom = Math.min(currentZoom + 0.1, 3);
      document.body.style.zoom = currentZoom;
      showStatus("🔍 Zoomed in:", Math.round(currentZoom * 100) + "%");
      return;
    }
    if (cmd.includes("zoom out")) {
      currentZoom = Math.max(currentZoom - 0.1, 0.3);
      document.body.style.zoom = currentZoom;
      showStatus("🔎 Zoomed out:", Math.round(currentZoom * 100) + "%");
      return;
    }
    if (cmd.includes("reset zoom")) {
      currentZoom = 1;
      document.body.style.zoom = currentZoom;
      showStatus("🔄 Zoom reset to 100%");
      return;
    }

    // ----- Suggestion / Autocomplete selection -----
    const selectionVerb = /\b(?:choose|select|pick|go(?:\s+with)?|go|with)\b/;
    const ordMatch = cmd.match(/\b(second last|first|second|third|last)\b/);
    if (selectionVerb.test(cmd) && ordMatch) {
      const ord = ordMatch[1];
      selectSuggestionAtOrdinal(ord);
      return;
    }

    // ----- Scrolling -----
    if (cmd.includes("scroll down") || cmd === "down") {
      stopScrolling();
      scrollDirection = 1;
      rafId = requestAnimationFrame(scrollLoop);
      return;
    } else if (cmd.includes("scroll up") || cmd === "up") {
      stopScrolling();
      scrollDirection = -1;
      rafId = requestAnimationFrame(scrollLoop);
      return;
    } else if (cmd.includes("stop")) {
      stopScrolling();
      return;
    } else if (cmd.includes("scroll faster") || cmd === "faster") {
      scrollSpeed = Math.min(scrollSpeed + 2, 50);
      showStatus("⚡ Faster scroll:", scrollSpeed);
      return;
    } else if (cmd.includes("scroll slower") || cmd === "slower") {
      scrollSpeed = Math.max(scrollSpeed - 2, 1);
      showStatus("🐢 Slower scroll:", scrollSpeed);
      return;
    }

    // ----- Focus -----
    if (cmd.startsWith("focus")) {
      const keyword = cmd.replace(/^focus\s*/i, "").trim();
      focusElement(keyword);
      return;
    }

    // ----- Type -----
    if (cmd.startsWith("type")) {
      let textRaw = cmd.replace(/^type\s*/i, "").trim();
      if (!textRaw) {
        showStatus("⚠️ Nothing to type");
        return;
      }
      const typeTokens = textRaw.split(/\s+/).filter(Boolean);
      const allSingleChar = typeTokens.every((t) => t.length === 1);
      const finalText = allSingleChar
        ? typeTokens.map((t) => (isCapsLock ? t.toUpperCase() : t.toLowerCase())).join("")
        : typeTokens.map((t) => (isCapsLock ? t.toUpperCase() : t.toLowerCase())).join(" ");
      const activeInput = document.activeElement;
      if (activeInput && (activeInput.tagName === "INPUT" || activeInput.tagName === "TEXTAREA")) {
        activeInput.value = (activeInput.value || "") + finalText;
        activeInput.dispatchEvent(new Event("input", { bubbles: true }));
        showStatus("✍️ Typed:", finalText);
      } else {
        showStatus("⚠️ No input is focused");
      }
      return;
    }

    // ----- Clear input -----
    if (cmd.includes("clear input")) {
      if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) {
        document.activeElement.value = "";
        document.activeElement.dispatchEvent(new Event("input", { bubbles: true }));
        showStatus("🧹 Cleared input");
      } else {
        showStatus("⚠️ No input is focused");
      }
      return;
    }

    // ----- Enter / Submit -----
    if (cmd.includes("press enter") || cmd === "enter" || cmd.includes("submit")) {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
        const down = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 });
        const up = new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 });
        active.dispatchEvent(down);
        active.dispatchEvent(up);
        if (active.form) {
          active.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          try { active.form.submit(); } catch (e) {}
        }
        const searchBtn = document.querySelector("button[aria-label='Google Search']") || document.querySelector("button[type=submit]") || document.querySelector("yt-icon[icon='search']");
        if (searchBtn) searchBtn.click();
        showStatus("⏎ Enter/Submit triggered");
      } else {
        showStatus("⚠️ No input is focused");
      }
      return;
    }

    // ----- Click -----
    if (cmd.startsWith("click")) {
      handleClickCommand(cmd);
      return;
    }

    // ----- Tab navigation -----
    if (cmd.includes("next tab")) {
      chrome.runtime.sendMessage({ type: "NEXT_TAB" });
      return;
    } else if (cmd.includes("previous tab")) {
      chrome.runtime.sendMessage({ type: "PREVIOUS_TAB" });
      return;
    } else if (cmd.startsWith("switch to")) {
      const query = cmd.replace(/^switch to\s*/i, "").trim();
      chrome.runtime.sendMessage({ type: "SWITCH_TAB", query });
      return;
    }

    // ----- Open new tab ----- (keep existing behavior)
    if (cmd.startsWith("open new tab")) {
      const query = cmd.replace(/^open new tab\s*/i, "").trim();
      chrome.runtime.sendMessage({ type: "OPEN_NEW_TAB", query });
      return;
    }

    showStatus("❓ Unknown command: " + cmd);
  }

  // -----------------------------
  // Status Box
  // -----------------------------
  function showStatus(msg, highlight = "") {
    let box = document.getElementById("voice-status-box");
    if (box) box.remove();

    box = document.createElement("div");
    box.id = "voice-status-box";
    box.innerHTML = `<b>${msg}</b> ${highlight}`;
    box.style.cssText = `
      position: fixed; bottom: 10px; right: 10px;
      background: #222; color: #fff; padding: 8px 12px;
      border-radius: 6px; font-size: 13px; z-index: 999999;
      max-width: 260px;
    `;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3000);
  }

  // -----------------------------
  // Stop Scrolling
  // -----------------------------
  function stopScrolling() {
    scrollDirection = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // -----------------------------
  // Click Command
  // -----------------------------
  function handleClickCommand(cmd) {
    const keyword = cmd.replace(/^click\s*/i, "").trim();
    if (!keyword) {
      showStatus("Say 'click' + name of button/link");
      return;
    }

    const els = Array.from(
      document.querySelectorAll(
        `button, a, input[type=button], input[type=submit], [role=button], [role=link]`
      )
    );

    const match = els.find((el) => {
      const text = (el.innerText || el.value || "").toLowerCase().trim();
      return text.includes(keyword);
    });

    if (match) {
      match.click();
      showStatus("✅ Clicked:", keyword);
    } else {
      showStatus("❌ No match for", keyword);
    }
  }

  // -----------------------------
  // Focus Command
  // -----------------------------
  function focusElement(keyword) {
    const els = Array.from(document.querySelectorAll("input, textarea"));
    const match = els.find(
      (el) =>
        (el.placeholder || "").toLowerCase().includes(keyword) ||
        (el.name || "").toLowerCase().includes(keyword) ||
        (el.id || "").toLowerCase().includes(keyword)
    );
    if (match) {
      match.focus();
      showStatus("🎯 Focused:", keyword);
    } else {
      showStatus("❌ No input found for", keyword);
    }
  }

  // -----------------------------
  // Message listener from popup
  // -----------------------------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.__VOICE_EXT_CMD) return;
    const { __VOICE_EXT_CMD, payload } = msg;

    if (__VOICE_EXT_CMD === "start_listening") startListening(payload.lang);
    if (__VOICE_EXT_CMD === "stop_listening") stopListening();
    if (__VOICE_EXT_CMD === "command" && payload?.text)
      handleCommand(payload.text);
  });
}

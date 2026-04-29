// Spotify Client IDs are public (only the secret on the server-side flow is sensitive).
// This implicit-grant flow runs entirely in the browser, so the ID is intentionally exposed.
const SPOTIFY_CLIENT_ID = "503fde2f0eee4cf69dea8b4c3e030896";
const REDIRECT_URI = window.location.origin + window.location.pathname;

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const API_BASE_URL = "https://api.spotify.com/v1";

const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "playlist-read-private",
  "playlist-read-collaborative",
];

const SNIPPET_DURATIONS = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_SUGGESTIONS = 8;

// ───── state ─────
let accessToken = null;
let refreshToken = null;
let tokenExpiryTime = null;
let currentPlaylistTracks = [];
let spotifyPlayer = null;
let webPlaybackDeviceId = null;
let failedGuessesArray = [];
let snippetTimerInterval = null;
let snippetPlayTimeout = null;
let currentSnippetPlaybackPosition = 0;
let currentSong = null;
let remainingGuesses = 0;
let currentSnippetDuration = SNIPPET_DURATIONS[0];

// ───── DOM refs (cached once) ─────
const $ = (id) => document.getElementById(id);

const loginButton = $("login-button");
const authSection = $("auth-section");
const playlistSection = $("playlist-section");
const playlistSelect = $("playlist-select");
const startGameButton = $("start-game-button");
const gameSection = $("game-section");
const playSnippetButton = $("play-snippet-button");
const guessInput = $("guess-input");
const submitGuessButton = $("submit-guess-button");
const skipButton = $("skip-button");
const guessesCountSpan = $("guesses-count");
const feedbackMessageDiv = $("feedback-message");
const resultsSection = $("results-section");
const resultMessageH3 = $("result-message");
const correctSongTitleSpan = $("correct-song-title");
const correctArtistNameSpan = $("correct-artist-name");
const spotifyLinkAnchor = $("spotify-link");
const playAgainButton = $("play-again-button");
const snippetProgressDisplay = $("snippet-progress-display");
const currentSnippetTimeEl = $("current-snippet-time");
const totalSnippetTimeEl = $("total-snippet-time");
const failedGuessesContainer = $("failed-guesses-container");
const failedGuessesList = $("failed-guesses-list");
const segmentBar = $("segment-bar");
const suggestionsDropdown = $("suggestions-dropdown");
const toastRegion = $("toast-region");

const segmentEls = segmentBar
  ? Array.from(segmentBar.querySelectorAll(".segment"))
  : [];

// ───── small helpers ─────
function show(el) {
  if (el) el.hidden = false;
}
function hide(el) {
  if (el) el.hidden = true;
}

function setFeedback(text, tone) {
  feedbackMessageDiv.textContent = text || "";
  feedbackMessageDiv.classList.remove("is-correct", "is-wrong");
  if (tone === "correct") feedbackMessageDiv.classList.add("is-correct");
  if (tone === "wrong") feedbackMessageDiv.classList.add("is-wrong");
}

function showToast(message, tone = "info", durationMs = 4000) {
  if (!toastRegion) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  if (tone === "error") toast.classList.add("is-error");
  if (tone === "success") toast.classList.add("is-success");
  toast.textContent = message;
  toastRegion.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("is-leaving");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, durationMs);
}

function generateRandomString(length) {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// ───── PKCE helpers ─────
function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeVerifier() {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem("spotify_code_verifier");
  if (!verifier) throw new Error("Missing PKCE verifier");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: SPOTIFY_CLIENT_ID,
    code_verifier: verifier,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || `HTTP ${res.status}`);
  }

  return res.json();
}

async function refreshAccessToken() {
  if (!refreshToken) return false;
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: SPOTIFY_CLIENT_ID,
    });
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) return false;
    const data = await res.json();
    accessToken = data.access_token;
    if (data.refresh_token) refreshToken = data.refresh_token;
    tokenExpiryTime = Date.now() + data.expires_in * 1000;
    return true;
  } catch (e) {
    console.error("Token refresh failed:", e);
    return false;
  }
}

function formatTime(milliseconds) {
  const ms = isNaN(milliseconds) || milliseconds < 0 ? 0 : milliseconds;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

function updateSegments({ activeIndex, finished = false } = {}) {
  segmentEls.forEach((seg, i) => {
    seg.classList.remove("is-used", "is-active");
    if (finished) {
      if (i <= activeIndex) seg.classList.add("is-used");
    } else {
      if (i < activeIndex) seg.classList.add("is-used");
      if (i === activeIndex) seg.classList.add("is-active");
    }
  });
}

// ───── auth (PKCE) ─────
async function redirectToSpotifyLogin() {
  if (window.location.protocol === "file:") {
    showToast(
      "Spotify rejects file:// redirects. Serve over HTTP — e.g. `python3 -m http.server 8000` then open http://127.0.0.1:8000/heardle/",
      "error",
      10000
    );
    return;
  }

  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateRandomString(16);

  localStorage.setItem("spotify_code_verifier", verifier);
  localStorage.setItem("spotify_auth_state", state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope: SCOPES.join(" "),
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  window.location.href = `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

async function handleAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  const storedState = localStorage.getItem("spotify_auth_state");

  // Clean URL early so a refresh doesn't re-trigger this flow.
  window.history.replaceState({}, "", window.location.pathname);

  if (error) {
    showToast(`Spotify login failed: ${error}`, "error", 6000);
    console.error("Spotify Auth Error:", error);
    return;
  }

  if (!code) return;

  if (!state || state !== storedState) {
    showToast("Login failed: state mismatch (possible CSRF).", "error");
    console.error("Spotify Auth Error: State mismatch.");
    return;
  }

  localStorage.removeItem("spotify_auth_state");

  let tokens;
  try {
    tokens = await exchangeCodeForToken(code);
  } catch (e) {
    showToast(`Token exchange failed: ${e.message}`, "error", 6000);
    console.error(e);
    return;
  }

  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token || null;
  tokenExpiryTime = Date.now() + tokens.expires_in * 1000;
  localStorage.removeItem("spotify_code_verifier");

  hide(authSection);
  showToast("Connected. Initializing player…", "success");

  if (
    window.onSpotifyWebPlaybackSDKReady &&
    typeof window.onSpotifyWebPlaybackSDKReady === "function" &&
    !spotifyPlayer
  ) {
    initializeSpotifyPlayer(accessToken);
  }

  fetchUserPlaylists();
}

// ───── Spotify Web Playback SDK ─────
window.onSpotifyWebPlaybackSDKReady = () => {
  if (!accessToken) return;
  initializeSpotifyPlayer(accessToken);
};

function initializeSpotifyPlayer(token) {
  if (spotifyPlayer) spotifyPlayer.disconnect();

  spotifyPlayer = new Spotify.Player({
    name: "heardle. player",
    getOAuthToken: async (cb) => {
      if (tokenExpiryTime && Date.now() > tokenExpiryTime) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          showToast("Session expired — reconnecting…", "error");
          redirectToSpotifyLogin();
          cb(null);
          return;
        }
      }
      cb(accessToken);
    },
    volume: 0.5,
  });

  spotifyPlayer.addListener("initialization_error", ({ message }) => {
    console.error("Player init error:", message);
    showToast(
      `Player init failed: ${message}. Allow pop-ups and use a supported browser.`,
      "error",
      6000
    );
  });

  spotifyPlayer.addListener("authentication_error", ({ message }) => {
    console.error("Player auth error:", message);
    showToast("Authentication failed. Reconnecting…", "error");
    redirectToSpotifyLogin();
  });

  spotifyPlayer.addListener("account_error", ({ message }) => {
    console.error("Player account error:", message);
    showToast(
      "Spotify Premium is required for in-browser playback.",
      "error",
      6000
    );
    disableGameFeaturesDueToSDKError();
  });

  spotifyPlayer.addListener("playback_error", ({ message }) => {
    console.error("Playback error:", message);
    showToast(`Playback error: ${message}`, "error");
  });

  spotifyPlayer.addListener("player_state_changed", (state) => {
    if (!state) return;
    if (
      currentSong &&
      state.track_window?.current_track?.uri === currentSong.uri
    ) {
      currentSnippetPlaybackPosition = state.position;
    }
  });

  spotifyPlayer.addListener("ready", ({ device_id }) => {
    webPlaybackDeviceId = device_id;
    show(playlistSection);
    if (playlistSelect) playlistSelect.disabled = false;
    if (startGameButton)
      startGameButton.disabled = !playlistSelect || !playlistSelect.value;
    showToast("Player ready. Pick a playlist!", "success");
  });

  spotifyPlayer.addListener("not_ready", () => {
    webPlaybackDeviceId = null;
    if (playlistSelect) playlistSelect.disabled = true;
    if (startGameButton) startGameButton.disabled = true;
    if (playSnippetButton) playSnippetButton.disabled = true;
    showToast("Spotify player went offline.", "error");
  });

  spotifyPlayer
    .connect()
    .then((success) => {
      if (!success) console.warn("Web Playback SDK failed to connect.");
    })
    .catch((err) => console.error("Player connect error:", err));
}

function disableGameFeaturesDueToSDKError() {
  [
    playlistSelect,
    startGameButton,
    playSnippetButton,
    guessInput,
    submitGuessButton,
    skipButton,
  ].forEach((el) => {
    if (el) el.disabled = true;
  });
}

// ───── Web API ─────
async function fetchWebApi(endpoint, method, body) {
  const requireReLogin = (msg) => {
    accessToken = null;
    tokenExpiryTime = null;
    show(authSection);
    hide(playlistSection);
    hide(gameSection);
    hide(resultsSection);
    if (msg) showToast(msg, "error");
    redirectToSpotifyLogin();
  };

  if (!accessToken) {
    requireReLogin("Please sign in to continue.");
    return null;
  }
  if (tokenExpiryTime && Date.now() > tokenExpiryTime) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      requireReLogin("Session expired. Reconnecting…");
      return null;
    }
  }

  try {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      method,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      requireReLogin("Spotify token rejected — reconnecting.");
      return null;
    }

    if (!res.ok) {
      const errorData = await res
        .json()
        .catch(() => ({ message: "Unknown error" }));
      const msg = `Spotify API ${res.status}: ${
        errorData.error?.message || res.statusText || "Unknown error"
      }`;
      console.error(msg, errorData);
      if (res.status === 429) {
        showToast("Rate limited by Spotify — wait a moment.", "error");
      } else {
        showToast(msg, "error");
      }
      return null;
    }

    if (res.status === 204) return null;
    return await res.json();
  } catch (networkError) {
    console.error("Network/parse error:", networkError);
    showToast("Network error. Check your connection.", "error");
    return null;
  }
}

async function fetchUserPlaylists() {
  const data = await fetchWebApi("/me/playlists?limit=50", "GET");
  if (!data || !Array.isArray(data.items)) {
    playlistSelect.innerHTML =
      '<option value="" disabled>Could not load playlists.</option>';
    startGameButton.disabled = true;
    return;
  }

  playlistSelect.innerHTML =
    '<option value="">— Select a playlist —</option>';

  if (data.items.length === 0) {
    playlistSelect.innerHTML +=
      '<option value="" disabled>No playlists found.</option>';
    startGameButton.disabled = true;
    return;
  }

  data.items.forEach((playlist) => {
    if (playlist.tracks.total > 0) {
      const option = document.createElement("option");
      option.value = playlist.id;
      option.textContent = `${playlist.name} (${playlist.tracks.total})`;
      playlistSelect.appendChild(option);
    }
  });

  startGameButton.disabled = true;
  show(playlistSection);
  hide(gameSection);
  hide(resultsSection);
}

async function fetchPlaylistTracks(playlistId) {
  currentPlaylistTracks = [];
  setFeedback("Loading tracks…");
  playSnippetButton.disabled = true;
  startGameButton.disabled = true;

  const fields =
    "items(track(name,artists(name),id,uri,external_urls(spotify)))";
  const data = await fetchWebApi(
    `/playlists/${playlistId}/tracks?fields=${fields}&limit=50`,
    "GET"
  );

  const validTracks = data?.items
    ? data.items
        .map((item) => item.track)
        .filter(
          (t) =>
            t &&
            t.uri &&
            t.name &&
            t.artists &&
            t.artists.length > 0 &&
            t.id
        )
    : [];

  if (validTracks.length === 0) {
    showToast(
      "No playable tracks in that playlist. Pick another.",
      "error"
    );
    show(playlistSection);
    hide(gameSection);
    setFeedback("");
    if (playlistSelect) playlistSelect.disabled = false;
    if (startGameButton) startGameButton.disabled = true;
    return;
  }

  currentPlaylistTracks = validTracks;

  hide(playlistSection);
  show(gameSection);
  hide(resultsSection);
  startGame();
}

// ───── game flow ─────
function startGame() {
  if (currentPlaylistTracks.length === 0) {
    showToast("No tracks available.", "error");
    show(playlistSection);
    hide(gameSection);
    return;
  }
  if (!webPlaybackDeviceId) {
    showToast("Spotify player isn't ready yet — try again in a moment.", "error");
    playSnippetButton.disabled = true;
    return;
  }

  currentSong =
    currentPlaylistTracks[
      Math.floor(Math.random() * currentPlaylistTracks.length)
    ];
  remainingGuesses = SNIPPET_DURATIONS.length;
  currentSnippetDuration = SNIPPET_DURATIONS[0];
  failedGuessesArray = [];

  hide(snippetProgressDisplay);
  if (snippetTimerInterval) clearInterval(snippetTimerInterval);
  if (snippetPlayTimeout) clearTimeout(snippetPlayTimeout);
  if (currentSnippetTimeEl) currentSnippetTimeEl.textContent = "0:00";
  if (totalSnippetTimeEl) totalSnippetTimeEl.textContent = "0:00";

  guessInput.value = "";
  hideSuggestions();
  setFeedback('New round — press play to hear your first snippet.');
  hide(resultsSection);

  failedGuessesList.innerHTML = "";
  hide(failedGuessesContainer);

  playSnippetButton.disabled = false;
  guessInput.disabled = false;
  submitGuessButton.disabled = false;
  skipButton.disabled = false;
  guessesCountSpan.textContent = remainingGuesses;

  updateSegments({ activeIndex: 0 });

  if (spotifyPlayer && !resultsSection.hidden) {
    spotifyPlayer.pause().catch(() => {});
  }
}

async function playTrackSnippetWithSDK() {
  if (!currentSong || !currentSong.uri) {
    setFeedback("No song loaded to play.");
    return;
  }
  if (!spotifyPlayer || !webPlaybackDeviceId) {
    setFeedback("Spotify player isn't ready. Try re-logging in.");
    if (!spotifyPlayer && accessToken) initializeSpotifyPlayer(accessToken);
    return;
  }

  playSnippetButton.disabled = true;
  setFeedback("Loading snippet…");

  if (snippetPlayTimeout) clearTimeout(snippetPlayTimeout);
  if (snippetTimerInterval) clearInterval(snippetTimerInterval);

  try {
    // Mute first so any pre-snippet audio leak is inaudible.
    try { await spotifyPlayer.setVolume(0); } catch (_) {}

    // Skip the Web API call if the track is already loaded (e.g. replay
    // within the same round) — we can drive playback entirely via the SDK.
    let needsLoad = true;
    try {
      const state = await spotifyPlayer.getCurrentState();
      if (state?.track_window?.current_track?.uri === currentSong.uri) {
        needsLoad = false;
      }
    } catch (_) {}

    if (needsLoad) {
      const playResponse = await fetchWebApi(
        `/me/player/play?device_id=${webPlaybackDeviceId}`,
        "PUT",
        { uris: [currentSong.uri] }
      );

      if (playResponse === null && !accessToken) {
        // Re-login was triggered
        return;
      }

      const ready = await waitForTrackReady(currentSong.uri, 4000);
      if (!ready) {
        try { await spotifyPlayer.setVolume(0.5); } catch (_) {}
        setFeedback("Couldn't load the snippet — try again.");
        playSnippetButton.disabled = false;
        return;
      }
    }

    // Reset to position 0 while still muted.
    try { await spotifyPlayer.pause(); } catch (_) {}
    try { await spotifyPlayer.seek(0); } catch (_) {}

    if (totalSnippetTimeEl)
      totalSnippetTimeEl.textContent = formatTime(currentSnippetDuration);
    if (currentSnippetTimeEl) currentSnippetTimeEl.textContent = "0:00";
    show(snippetProgressDisplay);
    currentSnippetPlaybackPosition = 0;

    // Unmute and start the actual snippet.
    try { await spotifyPlayer.setVolume(0.5); } catch (_) {}
    const snippetStartedAt = performance.now();
    await spotifyPlayer.resume();
    setFeedback(`Listening — ${currentSnippetDuration / 1000}s snippet.`);

    snippetTimerInterval = setInterval(() => {
      const elapsed = performance.now() - snippetStartedAt;
      currentSnippetPlaybackPosition = Math.min(
        elapsed,
        currentSnippetDuration
      );
      if (currentSnippetTimeEl) {
        currentSnippetTimeEl.textContent = formatTime(
          currentSnippetPlaybackPosition
        );
      }
    }, 100);

    snippetPlayTimeout = setTimeout(async () => {
      if (spotifyPlayer) {
        try { await spotifyPlayer.pause(); } catch (_) {}
        setFeedback("Snippet finished — make your guess.");
      }
      if (snippetTimerInterval) clearInterval(snippetTimerInterval);
      if (currentSnippetTimeEl)
        currentSnippetTimeEl.textContent = formatTime(currentSnippetDuration);
      playSnippetButton.disabled = false;
    }, currentSnippetDuration);
  } catch (apiError) {
    console.error("Snippet playback error:", apiError);
    setFeedback("Couldn't play the snippet — is Spotify active?");
    try { await spotifyPlayer.setVolume(0.5); } catch (_) {}
    if (snippetTimerInterval) clearInterval(snippetTimerInterval);
    hide(snippetProgressDisplay);
    playSnippetButton.disabled = false;
  }
}

async function waitForTrackReady(expectedUri, timeoutMs) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    try {
      const state = await spotifyPlayer.getCurrentState();
      if (state?.track_window?.current_track?.uri === expectedUri) {
        return true;
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 60));
  }
  return false;
}

// ───── guesses ─────
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, "")
    .trim();
}

function submitGuess() {
  if (!currentSong || guessInput.disabled) return;

  const userGuess = guessInput.value.trim();
  if (!userGuess) {
    setFeedback("Type a song or artist first.");
    return;
  }

  const normalizedGuess = normalize(userGuess);
  const songMatches = normalizedGuess === normalize(currentSong.name);
  const artistMatches = currentSong.artists.some(
    (a) => normalize(a.name) === normalizedGuess
  );

  if (songMatches || artistMatches) {
    setFeedback(
      `Correct — "${currentSong.name}" by ${currentSong.artists[0].name}.`,
      "correct"
    );
    revealSong(true);
  } else {
    setFeedback("Not quite. Try again.", "wrong");
    failedGuessesArray.push(userGuess);
    displayFailedGuesses();
    handleIncorrectGuess();
  }

  guessInput.value = "";
  hideSuggestions();
}

function displayFailedGuesses() {
  failedGuessesList.innerHTML = "";
  if (failedGuessesArray.length === 0) {
    hide(failedGuessesContainer);
    return;
  }
  failedGuessesArray.forEach((guess) => {
    const li = document.createElement("li");
    li.textContent = guess;
    failedGuessesList.appendChild(li);
  });
  show(failedGuessesContainer);
}

function handleIncorrectGuess() {
  remainingGuesses--;
  guessesCountSpan.textContent = remainingGuesses;

  if (remainingGuesses <= 0) {
    revealSong(false);
    return;
  }

  const durationIndex = SNIPPET_DURATIONS.length - remainingGuesses;
  currentSnippetDuration =
    SNIPPET_DURATIONS[
      Math.min(durationIndex, SNIPPET_DURATIONS.length - 1)
    ];
  updateSegments({ activeIndex: durationIndex });
  playSnippetButton.disabled = false;
}

function skipTurn() {
  if (guessInput.disabled || remainingGuesses <= 0) return;
  setFeedback("Skipped — more of the song will play next.", "wrong");
  handleIncorrectGuess();
}

function revealSong(isCorrect) {
  if (snippetPlayTimeout) clearTimeout(snippetPlayTimeout);
  if (spotifyPlayer) spotifyPlayer.pause().catch(() => {});

  hide(snippetProgressDisplay);
  if (snippetTimerInterval) clearInterval(snippetTimerInterval);

  correctSongTitleSpan.textContent = currentSong.name;
  correctArtistNameSpan.textContent = currentSong.artists
    .map((a) => a.name)
    .join(", ");
  spotifyLinkAnchor.href = currentSong.external_urls?.spotify || "#";

  resultMessageH3.textContent = isCorrect
    ? "You got it."
    : "Better luck next round.";
  show(resultsSection);

  const usedIndex = SNIPPET_DURATIONS.length - remainingGuesses;
  updateSegments({
    activeIndex: usedIndex - (isCorrect ? 0 : 1),
    finished: true,
  });

  playSnippetButton.disabled = true;
  guessInput.disabled = true;
  submitGuessButton.disabled = true;
  skipButton.disabled = true;
}

// ───── typeahead ─────
function renderSuggestions(query) {
  if (!suggestionsDropdown) return;

  const q = query.trim().toLowerCase();
  if (!q || currentPlaylistTracks.length === 0) {
    hideSuggestions();
    return;
  }

  const matches = [];
  for (const track of currentPlaylistTracks) {
    const nameMatch = track.name.toLowerCase().includes(q);
    const artistMatch = track.artists.some((a) =>
      a.name.toLowerCase().includes(q)
    );
    if (nameMatch || artistMatch) {
      matches.push(track);
      if (matches.length >= MAX_SUGGESTIONS) break;
    }
  }

  if (matches.length === 0) {
    hideSuggestions();
    return;
  }

  suggestionsDropdown.innerHTML = "";
  matches.forEach((track) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suggestion";
    btn.setAttribute("role", "option");

    const title = document.createElement("span");
    title.textContent = track.name;

    const artist = document.createElement("span");
    artist.className = "suggestion-artist";
    artist.textContent = track.artists.map((a) => a.name).join(", ");

    btn.append(title, artist);

    btn.addEventListener("mousedown", (e) => {
      // mousedown beats input blur, keeping click effective
      e.preventDefault();
      guessInput.value = track.name;
      hideSuggestions();
      guessInput.focus();
    });
    suggestionsDropdown.appendChild(btn);
  });

  show(suggestionsDropdown);
}

function hideSuggestions() {
  if (!suggestionsDropdown) return;
  suggestionsDropdown.innerHTML = "";
  hide(suggestionsDropdown);
}

// ───── boot + listeners ─────
function disableGameControlsPreLogin() {
  [
    playlistSelect,
    startGameButton,
    playSnippetButton,
    guessInput,
    submitGuessButton,
    skipButton,
  ].forEach((el) => {
    if (el) el.disabled = true;
  });
  hide(resultsSection);
  hide(gameSection);
  hide(playlistSection);
  show(authSection);
}

window.onload = () => {
  const search = window.location.search;
  if (search.includes("code=") || search.includes("error=")) {
    handleAuthCallback();
  } else if (accessToken && !spotifyPlayer) {
    initializeSpotifyPlayer(accessToken);
  } else if (!accessToken) {
    disableGameControlsPreLogin();
  }

  if (
    startGameButton &&
    (!webPlaybackDeviceId || !playlistSelect || !playlistSelect.value)
  ) {
    startGameButton.disabled = true;
  }
};

window.addEventListener("beforeunload", () => {
  if (spotifyPlayer) spotifyPlayer.disconnect();
});

if (loginButton) loginButton.addEventListener("click", redirectToSpotifyLogin);

if (startGameButton) {
  startGameButton.addEventListener("click", () => {
    const selectedPlaylistId = playlistSelect.value;
    if (selectedPlaylistId) {
      fetchPlaylistTracks(selectedPlaylistId);
    } else {
      showToast("Pick a playlist first.", "error");
    }
  });
}

if (playlistSelect) {
  playlistSelect.addEventListener("change", () => {
    startGameButton.disabled = !playlistSelect.value;
  });
}

if (playSnippetButton) {
  playSnippetButton.addEventListener("click", playTrackSnippetWithSDK);
}

if (submitGuessButton) {
  submitGuessButton.addEventListener("click", submitGuess);
}

if (guessInput) {
  guessInput.addEventListener("input", () =>
    renderSuggestions(guessInput.value)
  );
  guessInput.addEventListener("focus", () =>
    renderSuggestions(guessInput.value)
  );
  guessInput.addEventListener("blur", () => {
    // small delay so click on suggestion still fires
    setTimeout(hideSuggestions, 120);
  });
  guessInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitGuess();
    } else if (event.key === "Escape") {
      hideSuggestions();
    }
  });
}

if (skipButton) skipButton.addEventListener("click", skipTurn);

if (playAgainButton) {
  playAgainButton.addEventListener("click", () => {
    if (snippetPlayTimeout) clearTimeout(snippetPlayTimeout);
    startGame();
  });
}

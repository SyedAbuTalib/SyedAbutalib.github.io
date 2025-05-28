// --- Constants and Configuration ---
const SPOTIFY_CLIENT_ID = "503fde2f0eee4cf69dea8b4c3e030896"; // IMPORTANT: Replace with your actual Spotify Client ID
// For local development, this might be 'http://127.0.0.1:5500/index.html' or similar.
// For GitHub Pages, it would be 'https://<username>.github.io/<repo-name>/index.html'
// IMPORTANT: This exact URI MUST be whitelisted in your Spotify App settings on the Developer Dashboard.
const REDIRECT_URI = window.location.origin + window.location.pathname;

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const API_BASE_URL = "https://api.spotify.com/v1";

// Scopes for the permissions we need
const SCOPES = [
  "streaming", // Required for Web Playback SDK
  "user-read-email", // Recommended by Spotify for SDK context
  "user-read-private", // Recommended by Spotify for SDK context
  "playlist-read-private",
  "playlist-read-collaborative",
];

const SNIPPET_DURATIONS = [1000, 2000, 4000, 8000, 16000, 30000]; // Durations in ms for each guess attempt

// --- Global State ---
let accessToken = null;
let tokenExpiryTime = null;
let currentPlaylistTracks = [];
let spotifyPlayer = null; // For the Spotify Player instance
let webPlaybackDeviceId = null; // For the Device ID from the SDK
let failedGuessesArray = [];
let snippetTimerInterval = null;
let currentSnippetPlaybackPosition = 0;

// --- DOM Elements ---
// Auth Section
const loginButton = document.getElementById("login-button");
const authSection = document.getElementById("auth-section");

// Playlist Section
const playlistSection = document.getElementById("playlist-section");
const playlistSelect = document.getElementById("playlist-select");
const startGameButton = document.getElementById("start-game-button");

// Game Section
const gameSection = document.getElementById("game-section");
const playSnippetButton = document.getElementById("play-snippet-button");
const audioPlayer = document.getElementById("audio-player");
const guessInput = document.getElementById("guess-input");
const submitGuessButton = document.getElementById("submit-guess-button");
const skipButton = document.getElementById("skip-button");
const guessesCountSpan = document.getElementById("guesses-count");
const feedbackMessageDiv = document.getElementById("feedback-message");
const resultsSection = document.getElementById("results-section");
const resultMessageH3 = document.getElementById("result-message");
const correctSongTitleSpan = document.getElementById("correct-song-title");
const correctArtistNameSpan = document.getElementById("correct-artist-name");
const spotifyLinkAnchor = document.getElementById("spotify-link");
const playAgainButton = document.getElementById("play-again-button");

// --- Authentication Functions ---

/**
 * Redirects the user to Spotify's authorization page.
 */
function redirectToSpotifyLogin() {
  if (SPOTIFY_CLIENT_ID === "YOUR_SPOTIFY_CLIENT_ID") {
    alert(
      "Spotify Client ID is not set in app.js. Please replace 'YOUR_SPOTIFY_CLIENT_ID' with your actual client ID."
    );
    return;
  }
  const state = generateRandomString(16); // For CSRF protection
  localStorage.setItem("spotify_auth_state", state);

  let url = SPOTIFY_AUTH_URL;
  url += "?response_type=token";
  url += "&client_id=" + encodeURIComponent(SPOTIFY_CLIENT_ID);
  url += "&scope=" + encodeURIComponent(SCOPES.join(" "));
  url += "&redirect_uri=" + encodeURIComponent(REDIRECT_URI);
  url += "&state=" + encodeURIComponent(state);

  window.location.href = url;
}

/**
 * Parses the access token from the URL hash fragment after Spotify redirects back.
 */
function handleAuthCallback() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);

  const token = params.get("access_token");
  const state = params.get("state");
  const expiresIn = params.get("expires_in");
  const error = params.get("error");

  const storedState = localStorage.getItem("spotify_auth_state");

  if (error) {
    alert("Spotify login failed: " + error);
    console.error("Spotify Auth Error:", error);
    return;
  }

  if (!state || state !== storedState) {
    alert("Spotify login failed: State mismatch. Possible CSRF attack.");
    console.error("Spotify Auth Error: State mismatch.");
    return;
  }

  localStorage.removeItem("spotify_auth_state"); // Clean up state

  if (token) {
    accessToken = token;
    tokenExpiryTime = new Date().getTime() + parseInt(expiresIn, 10) * 1000;
    console.log("Spotify Access Token obtained:", accessToken);
    console.log("Token expires at:", new Date(tokenExpiryTime));

    // Clean the URL
    window.location.hash = "";

    // Update UI
    authSection.style.display = "none";
    // playlistSection.style.display = 'block'; // Playlist section shown by SDK 'ready' or fetchUserPlaylists
    feedbackMessageDiv.textContent =
      "Login successful! Initializing Spotify Player...";

    if (
      window.onSpotifyWebPlaybackSDKReady &&
      typeof window.onSpotifyWebPlaybackSDKReady === "function" &&
      !spotifyPlayer
    ) {
      initializeSpotifyPlayer(accessToken);
    } // else onSpotifyWebPlaybackSDKReady will call it when SDK loads.

    fetchUserPlaylists(); // This will also attempt to show playlistSection if playlists are found
  }
}

/**
 * Generates a random string for the 'state' parameter in OAuth.
 * @param {number} length The length of the string to generate.
 * @returns {string} A random string.
 */
function generateRandomString(length) {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Formats milliseconds into m:ss string.
 * @param {number} milliseconds The time in milliseconds.
 * @returns {string} Formatted time string like "m:ss".
 */
function formatTime(milliseconds) {
  if (isNaN(milliseconds) || milliseconds < 0) {
    milliseconds = 0;
  }
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

// --- Web Playback SDK Initialization ---
window.onSpotifyWebPlaybackSDKReady = () => {
  console.log("Spotify Web Playback SDK is ready.");
  if (!accessToken) {
    console.warn(
      "SDK ready, but no access token found yet. Will initialize player once token is available."
    );
    // Player will be initialized in handleAuthCallback or if token is already present on load
    return;
  }
  initializeSpotifyPlayer(accessToken);
};

function initializeSpotifyPlayer(token) {
  if (spotifyPlayer) {
    // If player already exists, disconnect it first
    spotifyPlayer.disconnect();
  }

  spotifyPlayer = new Spotify.Player({
    name: "Spotify HeardleWordle Player",
    getOAuthToken: (cb) => {
      // Note: Directly using the accessToken here.
      // If the token could expire and you had a refresh mechanism, you'd use it here.
      // For Implicit Grant, if it expires, the user has to re-authenticate.
      if (tokenExpiryTime && new Date().getTime() > tokenExpiryTime) {
        console.warn("Access token expired. Needs re-login for SDK token.");
        // Trigger re-login, then the SDK will re-attempt getOAuthToken upon next action or connect.
        redirectToSpotifyLogin();
        // It might be better to prevent player initialization if token is known to be expired.
        // However, getOAuthToken is called by the SDK when it needs a token.
        cb(null); // Indicate no token available right now
        return;
      }
      cb(token);
    },
    volume: 0.5, // Default volume
  });

  // Error handling
  spotifyPlayer.addListener("initialization_error", ({ message }) => {
    console.error("Failed to initialize Spotify Player:", message);
    alert(
      `Failed to initialize Spotify Player: ${message}. Ensure pop-ups are not blocked and you are using a supported browser.`
    );
    // Potentially disable game UI elements here
  });
  spotifyPlayer.addListener("authentication_error", ({ message }) => {
    console.error("Failed to authenticate Spotify Player:", message);
    alert(
      `Failed to authenticate Spotify Player: ${message}. Please try logging in again.`
    );
    redirectToSpotifyLogin(); // Force re-login
  });
  spotifyPlayer.addListener("account_error", ({ message }) => {
    console.error("Spotify Player account error:", message);
    // This error typically means the user does not have Spotify Premium.
    alert(
      `Spotify Player Error: ${message}. A Spotify Premium account is required to use this feature.`
    );
    // Disable game functionality or guide user
    disableGameFeaturesDueToSDKError();
  });
  spotifyPlayer.addListener("playback_error", ({ message }) => {
    console.error("Spotify Player playback error:", message);
    alert(`Spotify Player Playback Error: ${message}.`);
  });

  // Playback status updates
  spotifyPlayer.addListener("player_state_changed", (state) => {
    if (!state) {
      // If state is null, it might mean playback stopped or player is inactive.
      // Consider if currentSnippetPlaybackPosition should be reset or handled here.
      // For now, we only update on valid state with a track.
      return;
    }
    console.log("Player state changed:", state);

    // Check if the state change is for the currently playing snippet song
    if (
      currentSong &&
      state.track_window &&
      state.track_window.current_track &&
      state.track_window.current_track.uri === currentSong.uri
    ) {
      currentSnippetPlaybackPosition = state.position;
    }
    // If the track URI doesn't match, it means a different song is playing (e.g., user changed song in Spotify app)
    // or no song is active that matches our snippet. In this case, currentSnippetPlaybackPosition should not be updated
    // or might need to be reset if we want to be very strict.
    // For now, only updating if URIs match is a good first step.
  });

  // Ready
  spotifyPlayer.addListener("ready", ({ device_id }) => {
    console.log("Spotify Player is ready with Device ID:", device_id);
    webPlaybackDeviceId = device_id;
    playlistSection.style.display = "block"; // Show playlist selection
    if (playlistSelect) playlistSelect.disabled = false;
    // Disable start game button until a playlist is chosen
    if (startGameButton)
      startGameButton.disabled =
        playlistSelect.value === "" || !playlistSelect.value;
    feedbackMessageDiv.textContent = "Spotify Player ready. Select a playlist!";
  });

  // Not Ready
  spotifyPlayer.addListener("not_ready", ({ device_id }) => {
    console.log("Device ID has gone offline:", device_id);
    webPlaybackDeviceId = null;
    // Disable UI elements that depend on the player
    if (playlistSelect) playlistSelect.disabled = true;
    if (startGameButton) startGameButton.disabled = true;
    if (playSnippetButton) playSnippetButton.disabled = true;
    feedbackMessageDiv.textContent =
      "Spotify Player is offline. Please ensure Spotify is active.";
  });

  // Connect to the player!
  spotifyPlayer
    .connect()
    .then((success) => {
      if (success) {
        console.log("The Web Playback SDK successfully connected to Spotify!");
      } else {
        console.warn("The Web Playback SDK failed to connect to Spotify.");
        // This might happen if the browser blocks connection, or other issues.
      }
    })
    .catch((err) => console.error("Error connecting player:", err));
}

function disableGameFeaturesDueToSDKError() {
  // Call this function when SDK errors (like account_error) occur
  if (playlistSelect) playlistSelect.disabled = true;
  if (startGameButton) startGameButton.disabled = true;
  if (playSnippetButton) playSnippetButton.disabled = true;
  if (guessInput) guessInput.disabled = true;
  if (submitGuessButton) submitGuessButton.disabled = true;
  if (skipButton) skipButton.disabled = true;
  // Keep login button active or provide a way to re-initiate
}

// --- API Call Functions ---
async function fetchWebApi(endpoint, method, body) {
  if (!accessToken) {
    console.warn("Access token is missing. Redirecting to login.");
    authSection.style.display = "block"; // Show login section
    playlistSection.style.display = "none";
    gameSection.style.display = "none";
    resultsSection.style.display = "none";
    redirectToSpotifyLogin();
    return null;
  }

  // Simple check for token expiry (client-side only)
  if (tokenExpiryTime && new Date().getTime() > tokenExpiryTime) {
    console.warn(
      "Access token likely expired based on client-side timer. Redirecting to login."
    );
    accessToken = null; // Clear potentially stale token
    authSection.style.display = "block";
    playlistSection.style.display = "none";
    gameSection.style.display = "none";
    resultsSection.style.display = "none";
    redirectToSpotifyLogin();
    return null;
  }

  try {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      method,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      // Unauthorized - token invalid or expired
      console.warn(
        "Spotify API Error 401: Unauthorized. Access token may be invalid or expired. Redirecting to login."
      );
      accessToken = null; // Clear invalid token
      tokenExpiryTime = null;
      authSection.style.display = "block";
      playlistSection.style.display = "none";
      gameSection.style.display = "none";
      resultsSection.style.display = "none";
      redirectToSpotifyLogin(); // Re-authenticate
      return null;
    }

    if (!res.ok) {
      const errorData = await res
        .json()
        .catch(() => ({ message: "Unknown error structure" }));
      const errorMsg = `Spotify API Error ${res.status}: ${
        errorData.error?.message || res.statusText || "Unknown error"
      }`;
      console.error(errorMsg, errorData);
      alert(
        `An error occurred while communicating with Spotify: ${errorMsg}. Please try again or re-login.`
      );
      // For specific errors like 403 (Forbidden), you might guide the user to check permissions or re-login.
      // For 429 (Rate Limiting), inform the user to wait.
      if (res.status === 429) {
        alert(
          "You're making too many requests to Spotify. Please wait a moment and try again."
        );
      }
      return null;
    }

    // Handle cases where response is OK but content might be empty (e.g., 204 No Content)
    if (res.status === 204) {
      return null; // Or appropriate representation for no content
    }

    return await res.json();
  } catch (networkError) {
    console.error("Network error or error parsing JSON:", networkError);
    alert(
      "A network error occurred. Please check your connection and try again."
    );
    return null;
  }
}

async function fetchUserPlaylists() {
  console.log("Fetching user playlists...");
  const data = await fetchWebApi("/me/playlists?limit=50", "GET"); // Get up to 50 playlists

  if (data && Array.isArray(data.items)) {
    // Check if items is an array
    playlistSelect.innerHTML =
      '<option value="">-- Select a Playlist --</option>';
    if (data.items.length === 0) {
      playlistSelect.innerHTML +=
        '<option value="" disabled>No playlists found.</option>';
      startGameButton.disabled = true;
      return;
    }

    data.items.forEach((playlist) => {
      if (playlist.tracks.total > 0) {
        // Only add playlists that have tracks
        const option = document.createElement("option");
        option.value = playlist.id;
        option.textContent = `${playlist.name} (${playlist.tracks.total} tracks)`;
        playlistSelect.appendChild(option);
      }
    });
    // startGameButton.disabled = false; // This was true in instructions, but should be false if playlists are found
    // Corrected logic: button should be disabled initially as "-- Select a Playlist --" will be chosen.
    startGameButton.disabled = true;
    playlistSection.style.display = "block"; // Ensure it's visible
    gameSection.style.display = "none"; // Hide game section until playlist is chosen
    resultsSection.style.display = "none"; // Hide results section
  } else {
    console.error("Could not fetch user playlists or no items found.");
    playlistSelect.innerHTML =
      '<option value="" disabled>Could not load playlists.</option>';
    startGameButton.disabled = true;
    // Optionally, inform the user more directly
  }
}

async function fetchPlaylistTracks(playlistId) {
  console.log(`Fetching tracks for playlist ID: ${playlistId}`);
  currentPlaylistTracks = [];
  feedbackMessageDiv.textContent = "Loading tracks from playlist..."; // Loading message
  playSnippetButton.disabled = true; // Disable while loading new tracks
  startGameButton.disabled = true; // Also disable start game button during loading
  const songSuggestionsDatalist = document.getElementById("song-suggestions");

  // Request specific fields: name, artists (just name), id, uri, external_urls.spotify
  const fields =
    "items(track(name,artists(name),id,uri,external_urls(spotify)))";
  // Fetching up to 50 tracks, consistent with previous version. Consider pagination for very large playlists in future.
  const data = await fetchWebApi(
    `/playlists/${playlistId}/tracks?fields=${fields}&limit=50`,
    "GET"
  );

  if (data && Array.isArray(data.items)) {
    const validTracks = data.items
      .map((item) => item.track) // Get the track object
      // Filter for tracks that have a URI, name, and at least one artist.
      .filter(
        (track) =>
          track &&
          track.uri &&
          track.name &&
          track.artists &&
          track.artists.length > 0 &&
          track.id
      );

    if (validTracks.length === 0) {
      // This case means data.items was an array, but it was either empty OR tracks were filtered out
      alert(
        "This playlist doesn't have any tracks that can be played with the SDK, or they are unsuitable (e.g. missing URI). Please select another playlist."
      );
      console.warn(
        "No playable tracks (with URIs) after filtering in the selected playlist."
      );
      playlistSection.style.display = "block"; // Show playlist selection again
      gameSection.style.display = "none";
      feedbackMessageDiv.textContent =
        "No playable tracks in this playlist. Please select another."; // Updated feedback
      if (playlistSelect) playlistSelect.disabled = false;
      if (startGameButton) startGameButton.disabled = true;
      if (songSuggestionsDatalist) {
        songSuggestionsDatalist.innerHTML = ""; // Clear suggestions
      }
      return;
    }
    currentPlaylistTracks = validTracks;
    console.log("Playable tracks (with URIs) loaded:", currentPlaylistTracks);

    // Populate datalist
    if (songSuggestionsDatalist) {
      songSuggestionsDatalist.innerHTML = ""; // Clear previous
      currentPlaylistTracks.forEach((track) => {
        const option = document.createElement("option");
        option.value = track.name;
        songSuggestionsDatalist.appendChild(option);
      });
    }

    playlistSection.style.display = "none";
    gameSection.style.display = "block";
    resultsSection.style.display = "none";
    feedbackMessageDiv.textContent = "Tracks loaded! Starting new round..."; // Updated message

    startGame(); // Automatically start the first round.
  } else if (data && data.items && data.items.length === 0) {
    // Specifically handle case where items array is empty
    alert(
      "This playlist doesn't have any tracks that can be played with the SDK, or it's empty. Please select another playlist."
    );
    console.warn(
      "No playable tracks (with URIs) found in the selected playlist."
    );
    playlistSection.style.display = "block"; // Show playlist selection again
    gameSection.style.display = "none";
    feedbackMessageDiv.textContent =
      "No playable tracks in this playlist. Please select another."; // Updated feedback
    if (playlistSelect) playlistSelect.disabled = false;
    if (startGameButton) startGameButton.disabled = true;
    if (songSuggestionsDatalist) {
      songSuggestionsDatalist.innerHTML = ""; // Clear suggestions
    }
    return; // Return here as we've handled this specific "empty valid tracks" case
  } else {
    // General failure to fetch tracks or other error
    alert(
      "Could not fetch tracks for this playlist. Please try again or select a different playlist."
    );
    console.error(
      "Could not fetch tracks or no items found for playlist:",
      playlistId
    );
    playlistSection.style.display = "block";
    gameSection.style.display = "none";
    feedbackMessageDiv.textContent =
      "Failed to load tracks. Select a playlist.";
    if (playlistSelect) playlistSelect.disabled = false;
    if (startGameButton) startGameButton.disabled = true;
    if (songSuggestionsDatalist) {
      songSuggestionsDatalist.innerHTML = ""; // Clear suggestions
    }
  }
}

// --- Game Logic Functions ---
let currentSong = null;
let remainingGuesses = 0;
// let currentSnippetDuration = 1000; // 1 second initial duration - Now managed by SNIPPET_DURATIONS
let currentSnippetDuration = SNIPPET_DURATIONS[0];

function startGame() {
  if (currentPlaylistTracks.length === 0) {
    alert(
      "No tracks available to start the game. Please select another playlist."
    );
    playlistSection.style.display = "block"; // Show playlist selection again
    gameSection.style.display = "none"; // Hide game section
    return;
  }
  if (!webPlaybackDeviceId) {
    alert(
      "Spotify Player not ready. Please ensure Spotify is active and allow a moment for connection, or try re-logging in."
    );
    playSnippetButton.disabled = true;
    // Potentially show login button or a "connect player" button
    return;
  }

  currentSong =
    currentPlaylistTracks[
      Math.floor(Math.random() * currentPlaylistTracks.length)
    ];
  remainingGuesses = SNIPPET_DURATIONS.length;
  currentSnippetDuration = SNIPPET_DURATIONS[0];
  failedGuessesArray = []; // Reset failed guesses

  console.log(
    "New game started. Current song:",
    currentSong.name,
    "URI:",
    currentSong.uri
  );

  // Reset Snippet Progress Display
  const snippetProgressDisplay = document.getElementById(
    "snippet-progress-display"
  );
  const currentSnippetTimeEl = document.getElementById("current-snippet-time");
  const totalSnippetTimeEl = document.getElementById("total-snippet-time");
  if (snippetProgressDisplay) snippetProgressDisplay.style.display = "none";
  if (snippetTimerInterval) clearInterval(snippetTimerInterval);
  if (currentSnippetTimeEl) currentSnippetTimeEl.textContent = "0:00";
  if (totalSnippetTimeEl) totalSnippetTimeEl.textContent = "0:00";

  guessInput.value = "";
  feedbackMessageDiv.textContent = 'New round! Click "Play Snippet" to start.';
  resultsSection.style.display = "none";

  // Clear and hide failed guesses display
  const failedGuessesContainer = document.getElementById(
    "failed-guesses-container"
  );
  const failedGuessesList = document.getElementById("failed-guesses-list");
  if (failedGuessesList) {
    failedGuessesList.innerHTML = "";
  }
  if (failedGuessesContainer) {
    failedGuessesContainer.style.display = "none";
  }

  playSnippetButton.disabled = false;
  guessInput.disabled = false;
  submitGuessButton.disabled = false;
  skipButton.disabled = false;
  guessesCountSpan.textContent = remainingGuesses;

  // Stop player if it was playing from a previous round/reveal (e.g. after results were shown)
  if (spotifyPlayer && resultsSection.style.display === "block") {
    spotifyPlayer
      .pause()
      .catch((e) =>
        console.warn("Error pausing on new game start (after results):", e)
      );
  }
  if (snippetPlayTimeout) {
    clearTimeout(snippetPlayTimeout);
  }
}

let snippetPlayTimeout = null; // To manage stopping the snippet

async function playTrackSnippetWithSDK() {
  const snippetProgressDisplay = document.getElementById(
    "snippet-progress-display"
  );
  const currentSnippetTimeEl = document.getElementById("current-snippet-time");
  const totalSnippetTimeEl = document.getElementById("total-snippet-time");

  if (!currentSong || !currentSong.uri) {
    // Check for URI now
    console.error("No current song or URI to play with SDK.");
    feedbackMessageDiv.textContent = "Error: No song loaded to play.";
    return;
  }
  if (!spotifyPlayer || !webPlaybackDeviceId) {
    console.error("Spotify Player not ready or no Device ID.");
    feedbackMessageDiv.textContent =
      "Spotify Player is not ready. Please wait or try re-login.";
    // Potentially try to reconnect or re-initialize player if appropriate
    if (!spotifyPlayer && accessToken) initializeSpotifyPlayer(accessToken);
    return;
  }

  console.log(
    `Attempting to play URI: ${
      currentSong.uri
    } on device: ${webPlaybackDeviceId} for ${currentSnippetDuration / 1000}s`
  );
  playSnippetButton.disabled = true;
  feedbackMessageDiv.textContent = `Loading snippet...`;

  try {
    // Tell Spotify to play the track on our SDK player device
    const playResponse = await fetchWebApi(
      `/me/player/play?device_id=${webPlaybackDeviceId}`,
      "PUT",
      { uris: [currentSong.uri] }
    );

    if (playResponse === null) {
      // fetchWebApi returns null on error (e.g. network or API error)
      feedbackMessageDiv.textContent =
        "Failed to start track playback. Check connection or try again.";
      playSnippetButton.disabled = false; // Re-enable button
      return;
    }

    // Spotify API's play command can take a moment to start.
    // There's no direct callback for when playback *actually* starts on the SDK
    // after this API call. We rely on player_state_changed or a timeout.
    // For simplicity here, we'll use a short timeout before attempting to control the snippet.
    // A more robust solution would listen to 'player_state_changed' to confirm the track is playing.

    // Clear any existing snippet timeout
    if (snippetPlayTimeout) {
      clearTimeout(snippetPlayTimeout);
    }

    // Give Spotify a moment to start playing the track after the API call
    setTimeout(async () => {
      try {
        // Assuming playback has started, now try to control it for the snippet
        await spotifyPlayer.pause();
        await spotifyPlayer.seek(0);

        // ---- NEW DISPLAY LOGIC ----
        if (totalSnippetTimeEl)
          totalSnippetTimeEl.textContent = formatTime(currentSnippetDuration);
        if (currentSnippetTimeEl)
          currentSnippetTimeEl.textContent = formatTime(0);
        if (snippetProgressDisplay)
          snippetProgressDisplay.style.display = "block";
        currentSnippetPlaybackPosition = 0; // Reset position tracker

        if (snippetTimerInterval) clearInterval(snippetTimerInterval); // Clear previous just in case
        snippetTimerInterval = setInterval(() => {
          if (currentSnippetTimeEl) {
            const displayPosition = Math.min(
              currentSnippetPlaybackPosition,
              currentSnippetDuration
            );
            currentSnippetTimeEl.textContent = formatTime(displayPosition);
          }
        }, 500); // Update display every 500ms
        // ---- END NEW DISPLAY LOGIC ----

        await spotifyPlayer.resume(); // Start playing the snippet
        feedbackMessageDiv.textContent = `Playing snippet... (${
          currentSnippetDuration / 1000
        }s)`;

        snippetPlayTimeout = setTimeout(async () => {
          // This is the existing timeout to stop the snippet
          if (spotifyPlayer) {
            await spotifyPlayer.pause();
            feedbackMessageDiv.textContent =
              "Snippet finished. Make your guess!";
          }
          // ---- NEW: Clear interval and finalize display ----
          if (snippetTimerInterval) clearInterval(snippetTimerInterval);
          if (currentSnippetTimeEl)
            currentSnippetTimeEl.textContent = formatTime(
              currentSnippetDuration
            );
          // ---- END NEW ----
          playSnippetButton.disabled = false;
        }, currentSnippetDuration);
      } catch (sdkError) {
        console.error("Error controlling SDK for snippet:", sdkError);
        feedbackMessageDiv.textContent =
          "Error playing snippet. Is Spotify active?";
        if (snippetTimerInterval) clearInterval(snippetTimerInterval); // Also clear on error
        if (snippetProgressDisplay)
          snippetProgressDisplay.style.display = "none"; // Hide on error
        playSnippetButton.disabled = false;
      }
    }, 1000); // 1-second delay
  } catch (apiError) {
    // This catch is for fetchWebApi itself if it throws, though it's designed to return null on error
    console.error("API error starting playback:", apiError);
    feedbackMessageDiv.textContent = "Error telling Spotify to play the track.";
    playSnippetButton.disabled = false;
  }
}

function submitGuess() {
  if (!currentSong || guessInput.disabled) return; // Game not active or already ended

  const userGuess = guessInput.value.trim().toLowerCase();
  if (!userGuess) {
    feedbackMessageDiv.textContent = "Please enter a guess.";
    return;
  }

  const songTitle = currentSong.name.toLowerCase();
  const artistName = currentSong.artists[0].name.toLowerCase(); // Assuming primary artist

  // Normalize titles for comparison (remove common parenthetical additions like "(Remastered)")
  const normalize = (str) => str.replace(/\s*\([^)]*\)\s*/g, "").trim();

  const isCorrect =
    normalize(userGuess) === normalize(songTitle) ||
    normalize(userGuess) === normalize(artistName);

  if (isCorrect) {
    feedbackMessageDiv.textContent = `Correct! The song is ${currentSong.name} by ${currentSong.artists[0].name}.`;
    revealSong(true);
  } else {
    feedbackMessageDiv.textContent = "Incorrect guess. Try again!";
    // userGuess is already defined and normalized (lowercase, trimmed)
    failedGuessesArray.push(userGuess);
    displayFailedGuesses();
    handleIncorrectGuess();
  }
  guessInput.value = ""; // Clear input after guess
}

function displayFailedGuesses() {
  const failedGuessesContainer = document.getElementById(
    "failed-guesses-container"
  );
  const failedGuessesList = document.getElementById("failed-guesses-list");

  if (!failedGuessesList || !failedGuessesContainer) return; // Safety check

  failedGuessesList.innerHTML = ""; // Clear current list items

  if (failedGuessesArray.length === 0) {
    failedGuessesContainer.style.display = "none"; // Hide if no failed guesses
    return;
  }

  failedGuessesArray.forEach((guess) => {
    const listItem = document.createElement("li");
    listItem.textContent = guess;
    failedGuessesList.appendChild(listItem);
  });

  failedGuessesContainer.style.display = "block"; // Show the container
}

function handleIncorrectGuess() {
  remainingGuesses--;
  guessesCountSpan.textContent = remainingGuesses;

  if (remainingGuesses <= 0) {
    revealSong(false);
  } else {
    // Determine the index for the next snippet duration
    // SNIPPET_DURATIONS has N items. If 6 guesses, index is 6 - remainingGuesses.
    // e.g., 5 guesses left -> index 1 (second duration)
    //       1 guess left -> index 5 (last duration)
    const durationIndex = SNIPPET_DURATIONS.length - remainingGuesses;
    if (durationIndex < SNIPPET_DURATIONS.length) {
      currentSnippetDuration = SNIPPET_DURATIONS[durationIndex];
    } else {
      // Should not happen if remainingGuesses logic is correct with SNIPPET_DURATIONS.length
      currentSnippetDuration = SNIPPET_DURATIONS[SNIPPET_DURATIONS.length - 1];
    }
    console.log(
      `Incorrect. Next snippet duration: ${currentSnippetDuration / 1000}s`
    );
    playSnippetButton.disabled = false; // Ensure play button is enabled for next snippet
  }
}

function skipTurn() {
  if (guessInput.disabled || remainingGuesses <= 0) return; // Game not active or already ended / no guesses left

  feedbackMessageDiv.textContent = "Skipped! More of the song will play next.";
  handleIncorrectGuess();
}

function revealSong(isCorrect) {
  if (snippetPlayTimeout) {
    clearTimeout(snippetPlayTimeout);
  }
  if (spotifyPlayer) {
    spotifyPlayer
      .pause()
      .catch((e) => console.warn("Error pausing on revealSong:", e));
  }

  // Hide and clear snippet progress display
  const snippetProgressDisplay = document.getElementById(
    "snippet-progress-display"
  );
  if (snippetProgressDisplay) snippetProgressDisplay.style.display = "none";
  if (snippetTimerInterval) clearInterval(snippetTimerInterval);

  correctSongTitleSpan.textContent = currentSong.name;
  correctArtistNameSpan.textContent = currentSong.artists
    .map((a) => a.name)
    .join(", ");
  spotifyLinkAnchor.href = currentSong.external_urls.spotify || "#";

  resultMessageH3.textContent = isCorrect
    ? "You got it!"
    : "Better luck next time!";
  resultsSection.style.display = "block";

  playSnippetButton.disabled = true;
  guessInput.disabled = true;
  submitGuessButton.disabled = true;
  skipButton.disabled = true;
}

// --- Event Listeners ---
if (loginButton) {
  loginButton.addEventListener("click", redirectToSpotifyLogin);
}

// --- Initialization ---
/**
 * Runs when the page loads. Checks for auth callback.
 */
window.onload = () => {
  if (window.location.hash.includes("access_token")) {
    handleAuthCallback();
  } else if (accessToken && !spotifyPlayer) {
    // This path is less common with implicit grant unless token was somehow persisted
    initializeSpotifyPlayer(accessToken);
  } else if (!accessToken) {
    // Not logged in, ensure game controls are disabled and provide login guidance
    feedbackMessageDiv.textContent = "Please log in with Spotify to start.";
    disableGameControlsPreLogin(); // Explicitly disable controls
  }

  // Initial check for startGameButton, even if logged in, might need SDK.
  if (
    startGameButton &&
    (!webPlaybackDeviceId || (playlistSelect && playlistSelect.value === ""))
  ) {
    startGameButton.disabled = true;
  }
};

window.onbeforeunload = () => {
  if (spotifyPlayer) {
    console.log("Disconnecting Spotify Player before page unload.");
    spotifyPlayer.disconnect(); // Disconnect the player
  }
  // Note: You cannot reliably perform asynchronous operations in onbeforeunload,
  // but player.disconnect() is generally a synchronous cleanup call for the SDK instance.
};

function disableGameControlsPreLogin() {
  if (playlistSelect) playlistSelect.disabled = true;
  if (startGameButton) startGameButton.disabled = true;
  if (playSnippetButton) playSnippetButton.disabled = true;
  if (guessInput) guessInput.disabled = true;
  if (submitGuessButton) submitGuessButton.disabled = true;
  if (skipButton) skipButton.disabled = true;
  if (resultsSection) resultsSection.style.display = "none";
  if (gameSection) gameSection.style.display = "none";
  if (playlistSection) playlistSection.style.display = "none"; // Hide until logged in and SDK ready
  if (authSection) authSection.style.display = "block"; // Ensure login is visible
}

// Placeholder for later functions (will be filled in subsequent steps)
// function fetchPlaylistTracks(playlistId) { console.log(`TODO: Fetch tracks for ${playlistId}`); }
// function startGame(tracks) { console.log("TODO: Start game with tracks:", tracks); }
// function playTrackSnippet() { console.log("TODO: Play snippet"); }
// function submitGuess() { console.log("TODO: Submit guess"); }
// function skipTrack() { console.log("TODO: Skip track"); }
// function playAgain() { console.log("TODO: Play again"); }

if (startGameButton) {
  startGameButton.addEventListener("click", () => {
    const selectedPlaylistId = playlistSelect.value;
    if (selectedPlaylistId) {
      console.log(`Starting game with playlist ID: ${selectedPlaylistId}`);
      fetchPlaylistTracks(selectedPlaylistId);
    } else {
      alert("Please select a playlist first.");
    }
  });
}

// Disable start game button if no playlist is selected
if (playlistSelect) {
  playlistSelect.addEventListener("change", () => {
    if (playlistSelect.value) {
      startGameButton.disabled = false;
    } else {
      startGameButton.disabled = true;
    }
  });
  // Initial check
  startGameButton.disabled = !playlistSelect.value;
}

if (playSnippetButton) {
  playSnippetButton.addEventListener("click", playTrackSnippetWithSDK);
}

if (submitGuessButton) {
  submitGuessButton.addEventListener("click", submitGuess);
}

// Allow submitting guess with Enter key in the input field
if (guessInput) {
  guessInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      event.preventDefault(); // Prevent default form submission if it were in a form
      submitGuess();
    }
  });
}

if (skipButton) {
  skipButton.addEventListener("click", skipTurn);
}

if (playAgainButton) {
  playAgainButton.addEventListener("click", () => {
    // Stop any currently playing audio from the reveal
    // audioPlayer.pause(); // Old player
    // audioPlayer.currentTime = 0; // Old player
    if (snippetPlayTimeout) {
      // Clear any pending snippet timeout
      clearTimeout(snippetPlayTimeout);
    }

    // Simply call startGame to reset and pick a new song from the same playlist
    // spotifyPlayer.pause() is now called at the start of startGame()
    startGame();
  });
}

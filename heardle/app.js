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

let accessToken = null;
let tokenExpiryTime = null;
let currentPlaylistTracks = [];
let spotifyPlayer = null; 
let webPlaybackDeviceId = null; 
let failedGuessesArray = [];
let snippetTimerInterval = null;
let currentSnippetPlaybackPosition = 0;

const loginButton = document.getElementById("login-button");
const authSection = document.getElementById("auth-section");

const playlistSection = document.getElementById("playlist-section");
const playlistSelect = document.getElementById("playlist-select");
const startGameButton = document.getElementById("start-game-button");

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



function redirectToSpotifyLogin() {
  if (SPOTIFY_CLIENT_ID === "YOUR_SPOTIFY_CLIENT_ID") {
    alert(
      "Spotify Client ID is not set in app.js. Please replace 'YOUR_SPOTIFY_CLIENT_ID' with your actual client ID."
    );
    return;
  }
  const state = generateRandomString(16); 
  localStorage.setItem("spotify_auth_state", state);

  let url = SPOTIFY_AUTH_URL;
  url += "?response_type=token";
  url += "&client_id=" + encodeURIComponent(SPOTIFY_CLIENT_ID);
  url += "&scope=" + encodeURIComponent(SCOPES.join(" "));
  url += "&redirect_uri=" + encodeURIComponent(REDIRECT_URI);
  url += "&state=" + encodeURIComponent(state);

  window.location.href = url;
}


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

  localStorage.removeItem("spotify_auth_state"); 

  if (token) {
    accessToken = token;
    tokenExpiryTime = new Date().getTime() + parseInt(expiresIn, 10) * 1000;
    console.log("Spotify Access Token obtained:", accessToken);
    console.log("Token expires at:", new Date(tokenExpiryTime));

    window.location.hash = "";

    authSection.style.display = "none";
    feedbackMessageDiv.textContent =
      "Login successful! Initializing Spotify Player...";

    if (
      window.onSpotifyWebPlaybackSDKReady &&
      typeof window.onSpotifyWebPlaybackSDKReady === "function" &&
      !spotifyPlayer
    ) {
      initializeSpotifyPlayer(accessToken);
    } 

    fetchUserPlaylists(); 
  }
}


function generateRandomString(length) {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}


function formatTime(milliseconds) {
  if (isNaN(milliseconds) || milliseconds < 0) {
    milliseconds = 0;
  }
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

window.onSpotifyWebPlaybackSDKReady = () => {
  console.log("Spotify Web Playback SDK is ready.");
  if (!accessToken) {
    console.warn(
      "SDK ready, but no access token found yet. Will initialize player once token is available."
    );
    return;
  }
  initializeSpotifyPlayer(accessToken);
};

function initializeSpotifyPlayer(token) {
  if (spotifyPlayer) {
    spotifyPlayer.disconnect();
  }

  spotifyPlayer = new Spotify.Player({
    name: "Spotify HeardleWordle Player",
    getOAuthToken: (cb) => {
      if (tokenExpiryTime && new Date().getTime() > tokenExpiryTime) {
        console.warn("Access token expired. Needs re-login for SDK token.");
        redirectToSpotifyLogin();
        cb(null); 
        return;
      }
      cb(token);
    },
    volume: 0.5, 
  });

  spotifyPlayer.addListener("initialization_error", ({ message }) => {
    console.error("Failed to initialize Spotify Player:", message);
    alert(
      `Failed to initialize Spotify Player: ${message}. Ensure pop-ups are not blocked and you are using a supported browser.`
    );
  });
  spotifyPlayer.addListener("authentication_error", ({ message }) => {
    console.error("Failed to authenticate Spotify Player:", message);
    alert(
      `Failed to authenticate Spotify Player: ${message}. Please try logging in again.`
    );
    redirectToSpotifyLogin(); 
  });
  spotifyPlayer.addListener("account_error", ({ message }) => {
    console.error("Spotify Player account error:", message);
    alert(
      `Spotify Player Error: ${message}. A Spotify Premium account is required to use this feature.`
    );
    disableGameFeaturesDueToSDKError();
  });
  spotifyPlayer.addListener("playback_error", ({ message }) => {
    console.error("Spotify Player playback error:", message);
    alert(`Spotify Player Playback Error: ${message}.`);
  });

  spotifyPlayer.addListener("player_state_changed", (state) => {
    if (!state) {
      return;
    }
    console.log("Player state changed:", state);

    if (
      currentSong &&
      state.track_window &&
      state.track_window.current_track &&
      state.track_window.current_track.uri === currentSong.uri
    ) {
      currentSnippetPlaybackPosition = state.position;
    }
  });

  spotifyPlayer.addListener("ready", ({ device_id }) => {
    console.log("Spotify Player is ready with Device ID:", device_id);
    webPlaybackDeviceId = device_id;
    playlistSection.style.display = "block"; 
    if (playlistSelect) playlistSelect.disabled = false;
    if (startGameButton)
      startGameButton.disabled =
        playlistSelect.value === "" || !playlistSelect.value;
    feedbackMessageDiv.textContent = "Spotify Player ready. Select a playlist!";
  });

  spotifyPlayer.addListener("not_ready", ({ device_id }) => {
    console.log("Device ID has gone offline:", device_id);
    webPlaybackDeviceId = null;
    if (playlistSelect) playlistSelect.disabled = true;
    if (startGameButton) startGameButton.disabled = true;
    if (playSnippetButton) playSnippetButton.disabled = true;
    feedbackMessageDiv.textContent =
      "Spotify Player is offline. Please ensure Spotify is active.";
  });

  spotifyPlayer
    .connect()
    .then((success) => {
      if (success) {
        console.log("The Web Playback SDK successfully connected to Spotify!");
      } else {
        console.warn("The Web Playback SDK failed to connect to Spotify.");
      }
    })
    .catch((err) => console.error("Error connecting player:", err));
}

function disableGameFeaturesDueToSDKError() {
  if (playlistSelect) playlistSelect.disabled = true;
  if (startGameButton) startGameButton.disabled = true;
  if (playSnippetButton) playSnippetButton.disabled = true;
  if (guessInput) guessInput.disabled = true;
  if (submitGuessButton) submitGuessButton.disabled = true;
  if (skipButton) skipButton.disabled = true;
}

async function fetchWebApi(endpoint, method, body) {
  if (!accessToken) {
    console.warn("Access token is missing. Redirecting to login.");
    authSection.style.display = "block"; 
    playlistSection.style.display = "none";
    gameSection.style.display = "none";
    resultsSection.style.display = "none";
    redirectToSpotifyLogin();
    return null;
  }

  if (tokenExpiryTime && new Date().getTime() > tokenExpiryTime) {
    console.warn(
      "Access token likely expired based on client-side timer. Redirecting to login."
    );
    accessToken = null; 
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
      console.warn(
        "Spotify API Error 401: Unauthorized. Access token may be invalid or expired. Redirecting to login."
      );
      accessToken = null; 
      tokenExpiryTime = null;
      authSection.style.display = "block";
      playlistSection.style.display = "none";
      gameSection.style.display = "none";
      resultsSection.style.display = "none";
      redirectToSpotifyLogin(); 
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
      if (res.status === 429) {
        alert(
          "You're making too many requests to Spotify. Please wait a moment and try again."
        );
      }
      return null;
    }

    if (res.status === 204) {
      return null; 
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
  const data = await fetchWebApi("/me/playlists?limit=50", "GET"); 

  if (data && Array.isArray(data.items)) {
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
        const option = document.createElement("option");
        option.value = playlist.id;
        option.textContent = `${playlist.name} (${playlist.tracks.total} tracks)`;
        playlistSelect.appendChild(option);
      }
    });
    startGameButton.disabled = true;
    playlistSection.style.display = "block"; 
    gameSection.style.display = "none"; 
    resultsSection.style.display = "none"; 
  } else {
    console.error("Could not fetch user playlists or no items found.");
    playlistSelect.innerHTML =
      '<option value="" disabled>Could not load playlists.</option>';
    startGameButton.disabled = true;
  }
}

async function fetchPlaylistTracks(playlistId) {
  console.log(`Fetching tracks for playlist ID: ${playlistId}`);
  currentPlaylistTracks = [];
  feedbackMessageDiv.textContent = "Loading tracks from playlist..."; 
  playSnippetButton.disabled = true; 
  startGameButton.disabled = true; 
  const songSuggestionsDatalist = document.getElementById("song-suggestions");

  const fields =
    "items(track(name,artists(name),id,uri,external_urls(spotify)))";
  const data = await fetchWebApi(
    `/playlists/${playlistId}/tracks?fields=${fields}&limit=50`,
    "GET"
  );

  if (data && Array.isArray(data.items)) {
    const validTracks = data.items
      .map((item) => item.track) 
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
      alert(
        "This playlist doesn't have any tracks that can be played with the SDK, or they are unsuitable (e.g. missing URI). Please select another playlist."
      );
      console.warn(
        "No playable tracks (with URIs) after filtering in the selected playlist."
      );
      playlistSection.style.display = "block"; 
      gameSection.style.display = "none";
      feedbackMessageDiv.textContent =
        "No playable tracks in this playlist. Please select another."; 
      if (playlistSelect) playlistSelect.disabled = false;
      if (startGameButton) startGameButton.disabled = true;
      if (songSuggestionsDatalist) {
        songSuggestionsDatalist.innerHTML = ""; 
      }
      return;
    }
    currentPlaylistTracks = validTracks;
    console.log("Playable tracks (with URIs) loaded:", currentPlaylistTracks);

    if (songSuggestionsDatalist) {
      songSuggestionsDatalist.innerHTML = ""; 
      currentPlaylistTracks.forEach((track) => {
        const option = document.createElement("option");
        option.value = track.name;
        songSuggestionsDatalist.appendChild(option);
      });
    }

    playlistSection.style.display = "none";
    gameSection.style.display = "block";
    resultsSection.style.display = "none";
    feedbackMessageDiv.textContent = "Tracks loaded! Starting new round..."; 

    startGame(); 
  } else if (data && data.items && data.items.length === 0) {
    alert(
      "This playlist doesn't have any tracks that can be played with the SDK, or it's empty. Please select another playlist."
    );
    console.warn(
      "No playable tracks (with URIs) found in the selected playlist."
    );
    playlistSection.style.display = "block"; 
    gameSection.style.display = "none";
    feedbackMessageDiv.textContent =
      "No playable tracks in this playlist. Please select another."; 
    if (playlistSelect) playlistSelect.disabled = false;
    if (startGameButton) startGameButton.disabled = true;
    if (songSuggestionsDatalist) {
      songSuggestionsDatalist.innerHTML = ""; 
    }
    return; 
  } else {
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
      songSuggestionsDatalist.innerHTML = ""; 
    }
  }
}

let currentSong = null;
let remainingGuesses = 0;
let currentSnippetDuration = SNIPPET_DURATIONS[0];

function startGame() {
  if (currentPlaylistTracks.length === 0) {
    alert(
      "No tracks available to start the game. Please select another playlist."
    );
    playlistSection.style.display = "block"; 
    gameSection.style.display = "none"; 
    return;
  }
  if (!webPlaybackDeviceId) {
    alert(
      "Spotify Player not ready. Please ensure Spotify is active and allow a moment for connection, or try re-logging in."
    );
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

  console.log(
    "New game started. Current song:",
    currentSong.name,
    "URI:",
    currentSong.uri
  );

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

let snippetPlayTimeout = null; 

async function playTrackSnippetWithSDK() {
  const snippetProgressDisplay = document.getElementById(
    "snippet-progress-display"
  );
  const currentSnippetTimeEl = document.getElementById("current-snippet-time");
  const totalSnippetTimeEl = document.getElementById("total-snippet-time");

  if (!currentSong || !currentSong.uri) {
    console.error("No current song or URI to play with SDK.");
    feedbackMessageDiv.textContent = "Error: No song loaded to play.";
    return;
  }
  if (!spotifyPlayer || !webPlaybackDeviceId) {
    console.error("Spotify Player not ready or no Device ID.");
    feedbackMessageDiv.textContent =
      "Spotify Player is not ready. Please wait or try re-login.";
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
    const playResponse = await fetchWebApi(
      `/me/player/play?device_id=${webPlaybackDeviceId}`,
      "PUT",
      { uris: [currentSong.uri] }
    );

    if (playResponse === null) {
      feedbackMessageDiv.textContent =
        "Failed to start track playback. Check connection or try again.";
      playSnippetButton.disabled = false; 
      return;
    }


    if (snippetPlayTimeout) {
      clearTimeout(snippetPlayTimeout);
    }

    setTimeout(async () => {
      try {
        await spotifyPlayer.pause();
        await spotifyPlayer.seek(0);

        if (totalSnippetTimeEl)
          totalSnippetTimeEl.textContent = formatTime(currentSnippetDuration);
        if (currentSnippetTimeEl)
          currentSnippetTimeEl.textContent = formatTime(0);
        if (snippetProgressDisplay)
          snippetProgressDisplay.style.display = "block";
        currentSnippetPlaybackPosition = 0; 

        if (snippetTimerInterval) clearInterval(snippetTimerInterval); 
        snippetTimerInterval = setInterval(() => {
          if (currentSnippetTimeEl) {
            const displayPosition = Math.min(
              currentSnippetPlaybackPosition,
              currentSnippetDuration
            );
            currentSnippetTimeEl.textContent = formatTime(displayPosition);
          }
        }, 500); 

        await spotifyPlayer.resume(); 
        feedbackMessageDiv.textContent = `Playing snippet... (${
          currentSnippetDuration / 1000
        }s)`;

        snippetPlayTimeout = setTimeout(async () => {
          if (spotifyPlayer) {
            await spotifyPlayer.pause();
            feedbackMessageDiv.textContent =
              "Snippet finished. Make your guess!";
          }
          if (snippetTimerInterval) clearInterval(snippetTimerInterval);
          if (currentSnippetTimeEl)
            currentSnippetTimeEl.textContent = formatTime(
              currentSnippetDuration
            );
          playSnippetButton.disabled = false;
        }, currentSnippetDuration);
      } catch (sdkError) {
        console.error("Error controlling SDK for snippet:", sdkError);
        feedbackMessageDiv.textContent =
          "Error playing snippet. Is Spotify active?";
        if (snippetTimerInterval) clearInterval(snippetTimerInterval); 
        if (snippetProgressDisplay)
          snippetProgressDisplay.style.display = "none"; 
        playSnippetButton.disabled = false;
      }
    }, 1000); 
  } catch (apiError) {
    console.error("API error starting playback:", apiError);
    feedbackMessageDiv.textContent = "Error telling Spotify to play the track.";
    playSnippetButton.disabled = false;
  }
}

function submitGuess() {
  if (!currentSong || guessInput.disabled) return; 

  const userGuess = guessInput.value.trim().toLowerCase();
  if (!userGuess) {
    feedbackMessageDiv.textContent = "Please enter a guess.";
    return;
  }

  const songTitle = currentSong.name.toLowerCase();
  const artistName = currentSong.artists[0].name.toLowerCase(); 

  const normalize = (str) => str.replace(/\s*\([^)]*\)\s*/g, "").trim();

  const isCorrect =
    normalize(userGuess) === normalize(songTitle) ||
    normalize(userGuess) === normalize(artistName);

  if (isCorrect) {
    feedbackMessageDiv.textContent = `Correct! The song is ${currentSong.name} by ${currentSong.artists[0].name}.`;
    revealSong(true);
  } else {
    feedbackMessageDiv.textContent = "Incorrect guess. Try again!";
    failedGuessesArray.push(userGuess);
    displayFailedGuesses();
    handleIncorrectGuess();
  }
  guessInput.value = ""; 
}

function displayFailedGuesses() {
  const failedGuessesContainer = document.getElementById(
    "failed-guesses-container"
  );
  const failedGuessesList = document.getElementById("failed-guesses-list");

  if (!failedGuessesList || !failedGuessesContainer) return; 

  failedGuessesList.innerHTML = ""; 

  if (failedGuessesArray.length === 0) {
    failedGuessesContainer.style.display = "none"; 
    return;
  }

  failedGuessesArray.forEach((guess) => {
    const listItem = document.createElement("li");
    listItem.textContent = guess;
    failedGuessesList.appendChild(listItem);
  });

  failedGuessesContainer.style.display = "block"; 
}

function handleIncorrectGuess() {
  remainingGuesses--;
  guessesCountSpan.textContent = remainingGuesses;

  if (remainingGuesses <= 0) {
    revealSong(false);
  } else {
    const durationIndex = SNIPPET_DURATIONS.length - remainingGuesses;
    if (durationIndex < SNIPPET_DURATIONS.length) {
      currentSnippetDuration = SNIPPET_DURATIONS[durationIndex];
    } else {
      currentSnippetDuration = SNIPPET_DURATIONS[SNIPPET_DURATIONS.length - 1];
    }
    console.log(
      `Incorrect. Next snippet duration: ${currentSnippetDuration / 1000}s`
    );
    playSnippetButton.disabled = false; 
  }
}

function skipTurn() {
  if (guessInput.disabled || remainingGuesses <= 0) return; 

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

if (loginButton) {
  loginButton.addEventListener("click", redirectToSpotifyLogin);
}


window.onload = () => {
  if (window.location.hash.includes("access_token")) {
    handleAuthCallback();
  } else if (accessToken && !spotifyPlayer) {
    initializeSpotifyPlayer(accessToken);
  } else if (!accessToken) {
    feedbackMessageDiv.textContent = "Please log in with Spotify to start.";
    disableGameControlsPreLogin(); 
  }

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
    spotifyPlayer.disconnect(); 
  }
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
  if (playlistSection) playlistSection.style.display = "none"; 
  if (authSection) authSection.style.display = "block"; 
}


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

if (playlistSelect) {
  playlistSelect.addEventListener("change", () => {
    if (playlistSelect.value) {
      startGameButton.disabled = false;
    } else {
      startGameButton.disabled = true;
    }
  });
  startGameButton.disabled = !playlistSelect.value;
}

if (playSnippetButton) {
  playSnippetButton.addEventListener("click", playTrackSnippetWithSDK);
}

if (submitGuessButton) {
  submitGuessButton.addEventListener("click", submitGuess);
}

if (guessInput) {
  guessInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      event.preventDefault(); 
      submitGuess();
    }
  });
}

if (skipButton) {
  skipButton.addEventListener("click", skipTurn);
}

if (playAgainButton) {
  playAgainButton.addEventListener("click", () => {
    if (snippetPlayTimeout) {
      clearTimeout(snippetPlayTimeout);
    }

    startGame();
  });
}

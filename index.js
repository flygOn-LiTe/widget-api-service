const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;

//These need to be stored in REDIS for persistent storage and so values can be updated, NOT in Enviroment variables *UPDATE THIS*
let userAccessToken = process.env.TWITCH_USER_ACCESS_TOKEN; // Store the user access token here
let refreshToken = process.env.TWITCH_REFRESH_TOKEN; // Store the refresh token here
let userTokenExpiry = 0; // Track when the user token expires
let authToken = ""; // App access token for public calls
let tokenExpiry = 0; // Track when the app token expires

// Use CORS middleware -ISSUE WITH STREAM ELEMENTS MAKING ORIGIN NULL USING * FOR NOW
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Function to refresh the user access token using the refresh token
async function refreshUserAuthToken() {
  try {
    const response = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${
        process.env.TWITCH_CLIENT_ID
      }&client_secret=${
        process.env.TWITCH_CLIENT_SECRET
      }&grant_type=refresh_token&refresh_token=${encodeURIComponent(
        refreshToken
      )}`,
      {
        method: "POST",
      }
    );
    const data = await response.json();
    if (data.access_token) {
      userAccessToken = data.access_token;
      refreshToken = data.refresh_token || refreshToken;
      userTokenExpiry = Date.now() + data.expires_in * 1000; // Set the new expiry time
      console.log("User access token refreshed:", userAccessToken);
    } else {
      console.error("Error refreshing user access token:", data);
    }
  } catch (error) {
    console.error("Error refreshing user access token:", error);
  }
}

// Middleware to check and refresh user token if necessary
async function ensureValidUserToken(req, res, next) {
  if (!userAccessToken || Date.now() >= userTokenExpiry) {
    await refreshUserAuthToken();
  }
  next();
}
// Function to get a new app access token using Client Credentials Flow
async function getAuthToken() {
  const response = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    {
      method: "POST",
    }
  );
  const data = await response.json();
  authToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  console.log("New app access token obtained:", authToken);
}

// Middleware to ensure the app token is available and valid
app.use(async (req, res, next) => {
  if (!authToken || Date.now() >= tokenExpiry) {
    await getAuthToken();
  }
  next();
});
// Redirect to Twitch for authorization
app.get("/auth/twitch", (req, res) => {
  const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${process.env.TWITCH_CLIENT_ID}&redirect_uri=${process.env.PUBLIC_DOMAIN}/auth/twitch/callback&response_type=code&scope=moderator:read:followers`;
  res.redirect(authUrl);
});

// Callback endpoint to handle the authorization code
app.get("/auth/twitch/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Authorization code is required");
  }

  try {
    const response = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=${process.env.PUBLIC_DOMAIN}/auth/twitch/callback`,
      {
        method: "POST",
      }
    );
    const data = await response.json();

    if (data.access_token) {
      userAccessToken = data.access_token;
      refreshToken = data.refresh_token;
      userTokenExpiry = Date.now() + data.expires_in * 1000; // Set the new expiry time
      console.log("New user access token obtained:", userAccessToken);
      console.log("New user refresh token obtained:", refreshToken);
      res.send("Authorization successful. You can now use the token.");
    } else {
      console.error("Error fetching user access token:", data);
      res.status(500).send("Failed to fetch user access token.");
    }
  } catch (error) {
    console.error("Error during token exchange:", error);
    res.status(500).send("Error during token exchange.");
  }
});
// Endpoint to get userId from displayName using app access token
app.get("/get-user-id", ensureValidUserToken, async (req, res) => {
  const { displayName } = req.query;

  if (!displayName) {
    return res.status(400).json({ error: "displayName is required" });
  }

  try {
    const response = await fetch(
      `https://api.twitch.tv/helix/users?login=${displayName}`,
      {
        headers: {
          "Client-ID": process.env.TWITCH_CLIENT_ID,
          Authorization: `Bearer ${authToken}`, // Using app access token
        },
      }
    );
    const data = await response.json();

    if (response.ok && data.data.length > 0) {
      res.json({ userId: data.data[0].id });
    } else {
      console.error("Error response from Twitch API:", data);
      res
        .status(response.status)
        .json({ error: data.message || "User not found" });
    }
  } catch (error) {
    console.error("Error fetching user ID:", error);
    res.status(500).json({ error: "Failed to fetch user ID" });
  }
});

// Endpoint to check if a user is following a specific channel using user access token
app.get("/check-follower", ensureValidUserToken, async (req, res) => {
  const { userId, channelId } = req.query;

  try {
    const response = await fetch(
      `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${channelId}&user_id=${userId}`,
      {
        headers: {
          "Client-ID": process.env.TWITCH_CLIENT_ID,
          Authorization: `Bearer ${userAccessToken}`, // User access token with required scope
        },
      }
    );
    const data = await response.json();

    if (response.ok) {
      res.json({ isFollowing: data.data.length > 0 });
    } else {
      console.error("Error response from Twitch API:", data);
      res
        .status(response.status)
        .json({ error: data.message || "Failed to check follower status" });
    }
  } catch (error) {
    console.error("Error fetching follower status:", error);
    res.status(500).json({ error: "Failed to check follower status" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on PORT:${PORT}`);
});

const express = require("express");
const cors = require("cors"); // Import the CORS package
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;
let authToken = "";
let tokenExpiry = 0; // Track when the token expires

// Use CORS middleware
app.use(
  cors({
    origin: "https://streamelements.com", // Replace with the actual URL of your Stream Elements overlay
    methods: ["GET", "POST"], // Allow specific HTTP methods if needed
    allowedHeaders: ["Content-Type", "Authorization"], // Allow specific headers if needed
  })
);

// Function to get a new OAuth token using Client Credentials Flow
async function getAuthToken() {
  const response = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    {
      method: "POST",
    }
  );
  const data = await response.json();
  authToken = data.access_token;
  // Set token expiry time (e.g., current time + expires_in from response)
  tokenExpiry = Date.now() + data.expires_in * 1000;
  console.log("New token obtained:", authToken);
}

// Middleware to ensure the token is available and valid
app.use(async (req, res, next) => {
  // Check if the token exists and is not expired
  if (!authToken || Date.now() >= tokenExpiry) {
    await getAuthToken();
  }
  next();
});

// Endpoint to get userId from displayName
app.get("/get-user-id", async (req, res) => {
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
          Authorization: `Bearer ${authToken}`, // Ensure this token is valid
        },
      }
    );
    const data = await response.json();

    if (response.ok && data.data.length > 0) {
      // Return userId from the first matching user (should only be one)
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

app.get("/check-follower", async (req, res) => {
  const { userId, channelId } = req.query; // `channelId` is the broadcaster ID

  try {
    const response = await fetch(
      `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${channelId}&user_id=${userId}`,
      {
        headers: {
          "Client-ID": process.env.TWITCH_CLIENT_ID,
          Authorization: `Bearer ${authToken}`, // Ensure this token has the `moderator:read:followers` scope
        },
      }
    );
    const data = await response.json();

    if (response.ok) {
      // Check if the user is in the follower list (response will include this if user_id is provided)
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

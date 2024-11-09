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

// Endpoint to check if a user is following a specific channel
app.get("/check-follower", async (req, res) => {
  const { userId, channelId } = req.query;

  try {
    const response = await fetch(
      `https://api.twitch.tv/helix/users/follows?from_id=${userId}&to_id=${channelId}`,
      {
        headers: {
          "Client-ID": process.env.TWITCH_CLIENT_ID,
          Authorization: `Bearer ${authToken}`,
        },
      }
    );
    const data = await response.json();

    // Check if the user is following the channel
    res.json({ isFollowing: data.total > 0 });
  } catch (error) {
    console.error("Error fetching follower status:", error);
    res.status(500).json({ error: "Failed to check follower status" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on PORT:${PORT}`);
});

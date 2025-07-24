require('dotenv').config();
const playdl = require('play-dl');
playdl.setToken({
  spotify: {
    client_id: process.env.SPOTIFY_CLIENT_ID,
    client_secret: process.env.SPOTIFY_CLIENT_SECRET,
    refresh_token: ''
  }
});
(async () => {
  try {
    const spData = await playdl.spotify('https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6');
    console.log(spData);
  } catch (e) {
    console.error(e);
  }
})(); 
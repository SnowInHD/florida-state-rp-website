// Discord OAuth2 Login - Redirect to Discord authorization
export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.DISCORD_REDIRECT_URI);
    const scope = encodeURIComponent('identify guilds guilds.members.read');

    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;

    // Check if this is a direct navigation (redirect) or API call (return JSON)
    const acceptHeader = req.headers.accept || '';

    if (acceptHeader.includes('text/html') || req.query.redirect === 'true') {
        // Direct navigation - redirect to Discord
        return res.redirect(302, authUrl);
    }

    // API call - return the URL
    return res.status(200).json({ authUrl });
}

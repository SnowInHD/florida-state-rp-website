// Refresh Discord OAuth token
const DISCORD_API = 'https://discord.com/api/v10';

module.exports = async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'No refresh token provided' });
        }

        // Exchange refresh token for new access token
        const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            })
        });

        const tokens = await tokenResponse.json();

        if (tokens.error) {
            return res.status(401).json({
                error: 'Token refresh failed',
                details: tokens.error_description || tokens.error,
                needsReauth: true
            });
        }

        // Get updated user info
        const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
            headers: {
                Authorization: `Bearer ${tokens.access_token}`
            }
        });

        const user = await userResponse.json();

        // Get guild member info (roles)
        const guildId = process.env.DISCORD_GUILD_ID;
        const memberResponse = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
            headers: {
                Authorization: `Bearer ${tokens.access_token}`
            }
        });

        let roles = [];
        const inGuild = memberResponse.ok;

        if (memberResponse.ok) {
            const member = await memberResponse.json();
            roles = member.roles || [];
        }

        return res.status(200).json({
            success: true,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.global_name || user.username,
                avatar: user.avatar
                    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
                    : null
            },
            roleIds: roles,
            inGuild
        });

    } catch (error) {
        console.error('Token refresh error:', error);
        return res.status(500).json({
            error: 'Failed to refresh token',
            needsReauth: true
        });
    }
}

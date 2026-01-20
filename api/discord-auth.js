// Discord OAuth2 Authentication API
import Anthropic from '@anthropic-ai/sdk';

const DISCORD_API = 'https://discord.com/api/v10';

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { action } = req.query;

    try {
        switch (action) {
            case 'login':
                return handleLogin(req, res);
            case 'callback':
                return handleCallback(req, res);
            case 'user':
                return handleGetUser(req, res);
            case 'roles':
                return handleGetRoles(req, res);
            default:
                return res.status(400).json({ error: 'Invalid action' });
        }
    } catch (error) {
        console.error('Discord auth error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// Redirect to Discord OAuth2
function handleLogin(req, res) {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.DISCORD_REDIRECT_URI);
    const scope = encodeURIComponent('identify guilds guilds.members.read');

    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;

    return res.status(200).json({ authUrl });
}

// Handle OAuth2 callback
async function handleCallback(req, res) {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'No code provided' });
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.DISCORD_REDIRECT_URI
        })
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
        return res.status(400).json({ error: tokens.error_description || tokens.error });
    }

    // Get user info
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

    let member = null;
    let roles = [];

    if (memberResponse.ok) {
        member = await memberResponse.json();
        roles = member.roles || [];
    }

    return res.status(200).json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            displayName: user.global_name || user.username,
            avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
            discriminator: user.discriminator
        },
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        roleIds: roles,
        inGuild: memberResponse.ok
    });
}

// Get user info from token
async function handleGetUser(req, res) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (!userResponse.ok) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await userResponse.json();

    return res.status(200).json({
        id: user.id,
        username: user.username,
        displayName: user.global_name || user.username,
        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null
    });
}

// Get user roles from the guild
async function handleGetRoles(req, res) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const guildId = process.env.DISCORD_GUILD_ID;

    // Get member info
    const memberResponse = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (!memberResponse.ok) {
        return res.status(404).json({ error: 'User not in guild or no access' });
    }

    const member = await memberResponse.json();

    return res.status(200).json({
        roles: member.roles || [],
        nick: member.nick,
        joinedAt: member.joined_at
    });
}

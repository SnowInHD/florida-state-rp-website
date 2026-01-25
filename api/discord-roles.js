// Get user's roles from the Discord guild - v2
const DISCORD_API = 'https://discord.com/api/v10';

module.exports = async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const guildId = process.env.DISCORD_GUILD_ID;

        // Get member info from guild
        const memberResponse = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!memberResponse.ok) {
            if (memberResponse.status === 401) {
                return res.status(401).json({ error: 'Token expired or invalid' });
            }
            return res.status(404).json({ error: 'User not in guild or no access' });
        }

        const member = await memberResponse.json();

        return res.status(200).json({
            roles: member.roles || [],
            nick: member.nick,
            joinedAt: member.joined_at
        });

    } catch (error) {
        console.error('Get roles error:', error);
        return res.status(500).json({ error: 'Failed to get roles' });
    }
}

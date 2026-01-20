// Get all roles from the Discord guild (requires bot token)
const DISCORD_API = 'https://discord.com/api/v10';

export default async function handler(req, res) {
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
        const botToken = process.env.DISCORD_BOT_TOKEN;
        const guildId = process.env.DISCORD_GUILD_ID;

        if (!botToken) {
            return res.status(503).json({
                error: 'Bot token not configured',
                roles: []
            });
        }

        // Fetch guild roles using bot token
        const rolesResponse = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
            headers: {
                Authorization: `Bot ${botToken}`
            }
        });

        if (!rolesResponse.ok) {
            console.error('Failed to fetch guild roles:', rolesResponse.status);
            return res.status(500).json({
                error: 'Failed to fetch guild roles',
                roles: []
            });
        }

        const roles = await rolesResponse.json();

        // Convert Discord color integer to hex string
        function intToHex(colorInt) {
            if (!colorInt || colorInt === 0) return '#99aab5'; // Default Discord gray
            return '#' + colorInt.toString(16).padStart(6, '0');
        }

        // Return roles sorted by position (highest first)
        const sortedRoles = roles
            .filter(role => role.name !== '@everyone')
            .sort((a, b) => b.position - a.position)
            .map(role => ({
                id: role.id,
                name: role.name,
                color: intToHex(role.color),
                position: role.position,
                permissions: role.permissions
            }));

        return res.status(200).json({ roles: sortedRoles });

    } catch (error) {
        console.error('Get guild roles error:', error);
        return res.status(500).json({
            error: 'Failed to get guild roles',
            roles: []
        });
    }
}

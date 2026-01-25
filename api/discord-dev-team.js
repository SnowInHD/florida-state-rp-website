// Get all guild members with dev roles (requires bot token)
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
        const botToken = process.env.DISCORD_BOT_TOKEN;
        const guildId = process.env.DISCORD_GUILD_ID;

        if (!botToken) {
            return res.status(503).json({
                error: 'Bot token not configured',
                members: []
            });
        }

        // Get role IDs from query params (comma-separated)
        const roleIds = req.query.roles ? req.query.roles.split(',') : [];

        if (roleIds.length === 0) {
            return res.status(400).json({
                error: 'No role IDs provided',
                members: []
            });
        }

        // Fetch guild members (up to 1000)
        const membersResponse = await fetch(`${DISCORD_API}/guilds/${guildId}/members?limit=1000`, {
            headers: {
                Authorization: `Bot ${botToken}`
            }
        });

        if (!membersResponse.ok) {
            console.error('Failed to fetch guild members:', membersResponse.status);
            return res.status(500).json({
                error: 'Failed to fetch guild members',
                members: []
            });
        }

        const allMembers = await membersResponse.json();

        // Filter members who have at least one of the specified roles
        const devMembers = allMembers
            .filter(member => member.roles.some(roleId => roleIds.includes(roleId)))
            .map(member => ({
                id: member.user.id,
                username: member.user.username,
                displayName: member.nick || member.user.global_name || member.user.username,
                avatar: member.user.avatar
                    ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png`
                    : null,
                roles: member.roles.filter(roleId => roleIds.includes(roleId))
            }));

        return res.status(200).json({ members: devMembers });

    } catch (error) {
        console.error('Get dev team error:', error);
        return res.status(500).json({
            error: 'Failed to get dev team',
            members: []
        });
    }
}

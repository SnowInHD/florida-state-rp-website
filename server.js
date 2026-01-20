// ===================================
// CrashBot Backend Server
// ===================================
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// FiveM Knowledge Base for Claude context
const FIVEM_CONTEXT = `You are CrashBot, an AI assistant specialized in analyzing FiveM crash logs for the Florida State RP community.

Your expertise includes:
- FiveM client crashes and their causes
- GTA V game engine errors
- Lua scripting errors in FiveM resources
- Graphics driver issues (NVIDIA, AMD)
- Memory-related crashes
- Server resource conflicts
- Asset streaming errors (YFT, YDR, TXD files)
- Framework errors (ESX, QBCore, VORP)
- Native function errors

When analyzing crash logs:
1. Identify the PRIMARY cause of the crash
2. Determine if it's a CLIENT issue (user's computer) or RESOURCE issue (server-side script)
3. For RESOURCE issues, try to identify the specific resource name from the log
4. Provide clear, actionable solutions
5. Be friendly and helpful

Response format:
- crash_type: "client" | "resource" | "unknown"
- resource_name: string or null (if resource issue, extract the resource name)
- cause: Brief title of the crash cause
- description: Detailed explanation of what happened
- solutions: Array of step-by-step solutions
- severity: "low" | "medium" | "high"
- auto_reported: boolean (true if this is a resource issue that should be logged)

Common FiveM crash locations:
- AppData/Local/FiveM/FiveM.app/crashes - crash dumps
- AppData/Local/FiveM/FiveM.app/logs - log files
- citizen-resources - resource errors

Always be encouraging and let users know that resource issues will be automatically reported to the development team.`;

// Analyze crash log endpoint
app.post('/api/analyze', async (req, res) => {
    try {
        const { crashLog } = req.body;

        if (!crashLog) {
            return res.status(400).json({ error: 'No crash log provided' });
        }

        // Call Claude API
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: FIVEM_CONTEXT,
            messages: [
                {
                    role: 'user',
                    content: `Please analyze this FiveM crash log and provide your analysis in JSON format:

\`\`\`
${crashLog}
\`\`\`

Respond ONLY with valid JSON in this exact format:
{
    "crash_type": "client" | "resource" | "unknown",
    "resource_name": "resource_name_here" or null,
    "cause": "Brief title",
    "description": "Detailed explanation",
    "solutions": ["Solution 1", "Solution 2", "Solution 3"],
    "severity": "low" | "medium" | "high",
    "auto_reported": true or false
}`
                }
            ]
        });

        // Extract the response text
        const responseText = message.content[0].text;

        // Try to parse JSON from response
        let analysis;
        try {
            // Find JSON in the response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                analysis = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (parseError) {
            console.error('Failed to parse Claude response:', parseError);
            // Return a formatted error response
            analysis = {
                crash_type: 'unknown',
                resource_name: null,
                cause: 'Analysis Error',
                description: 'CrashBot encountered an issue analyzing your crash log. The log may be in an unexpected format.',
                solutions: [
                    'Try uploading a different crash log file',
                    'Make sure the file is a valid FiveM crash log',
                    'Contact server staff if the issue persists'
                ],
                severity: 'low',
                auto_reported: false,
                raw_response: responseText
            };
        }

        res.json({
            success: true,
            analysis
        });

    } catch (error) {
        console.error('Error analyzing crash log:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to analyze crash log',
            message: error.message
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'CrashBot API' });
});

// ===================================
// Discord OAuth2 Endpoints
// ===================================
const DISCORD_API = 'https://discord.com/api/v10';

// Get Discord login URL
app.get('/api/discord/login', (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.DISCORD_REDIRECT_URI);
    const scope = encodeURIComponent('identify guilds guilds.members.read');

    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;

    res.json({ authUrl });
});

// Handle OAuth2 callback - exchange code for tokens
app.post('/api/discord/callback', async (req, res) => {
    try {
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

        res.json({
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

    } catch (error) {
        console.error('Discord callback error:', error);
        res.status(500).json({ error: 'Failed to authenticate with Discord' });
    }
});

// Get user info from token
app.get('/api/discord/user', async (req, res) => {
    try {
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

        res.json({
            id: user.id,
            username: user.username,
            displayName: user.global_name || user.username,
            avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

// Get user roles from the guild
app.get('/api/discord/roles', async (req, res) => {
    try {
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

        res.json({
            roles: member.roles || [],
            nick: member.nick,
            joinedAt: member.joined_at
        });

    } catch (error) {
        console.error('Get roles error:', error);
        res.status(500).json({ error: 'Failed to get roles' });
    }
});

// Refresh OAuth token
app.post('/api/discord/refresh', async (req, res) => {
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

        res.json({
            success: true,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.global_name || user.username,
                avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null
            },
            roleIds: roles,
            inGuild
        });

    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ error: 'Failed to refresh token', needsReauth: true });
    }
});

// Get guild roles (for displaying role names) - requires bot token
app.get('/api/discord/guild-roles', async (req, res) => {
    try {
        const botToken = process.env.DISCORD_BOT_TOKEN;
        const guildId = process.env.DISCORD_GUILD_ID;

        if (!botToken) {
            return res.status(503).json({
                error: 'Bot token not configured',
                roles: []
            });
        }

        const response = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
            headers: {
                Authorization: `Bot ${botToken}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Failed to fetch guild roles:', error);
            return res.status(response.status).json({ error: 'Failed to fetch guild roles' });
        }

        const roles = await response.json();

        // Return roles sorted by position (highest first)
        const sortedRoles = roles
            .filter(role => role.name !== '@everyone')
            .sort((a, b) => b.position - a.position)
            .map(role => ({
                id: role.id,
                name: role.name,
                color: role.color ? `#${role.color.toString(16).padStart(6, '0')}` : '#99aab5',
                position: role.position
            }));

        res.json({ roles: sortedRoles });

    } catch (error) {
        console.error('Get guild roles error:', error);
        res.status(500).json({ error: 'Failed to get guild roles' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🤖 CrashBot API server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔐 Discord OAuth2 enabled`);
});

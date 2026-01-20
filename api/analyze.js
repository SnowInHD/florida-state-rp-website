// Vercel Serverless Function for CrashBot Analysis
import Anthropic from '@anthropic-ai/sdk';

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

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { crashLog } = req.body;

        if (!crashLog) {
            return res.status(400).json({ error: 'No crash log provided' });
        }

        // Initialize Anthropic client
        const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
        });

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
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                analysis = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (parseError) {
            console.error('Failed to parse Claude response:', parseError);
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

        return res.status(200).json({
            success: true,
            analysis
        });

    } catch (error) {
        console.error('Error analyzing crash log:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to analyze crash log',
            message: error.message
        });
    }
}

// ===================================
// CrashBot - AI Crash Log Analyzer
// ===================================
import { db } from '../../firebase-config.js';
import {
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    query,
    orderBy,
    where,
    increment,
    serverTimestamp
} from 'firebase/firestore';

// DOM Elements
const uploadZone = document.getElementById('uploadZone');
const crashLogInput = document.getElementById('crashLogInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const chatMessages = document.getElementById('chatMessages');
const issuesList = document.getElementById('issuesList');
const issueCount = document.getElementById('issueCount');

// State
let selectedFile = null;
let knownIssues = [];

// ===================================
// FiveM Crash Knowledge Base
// ===================================
const FIVEM_KNOWLEDGE = {
    // Common crash patterns and their explanations
    patterns: [
        {
            regex: /GTA5_b\d+\.exe.*EXCEPTION_ACCESS_VIOLATION/i,
            type: 'client',
            cause: 'Memory Access Violation',
            description: 'The game tried to access memory it shouldn\'t. This is often caused by corrupted game files or mod conflicts.',
            solutions: [
                'Verify your GTA V game files through Steam/Epic/Rockstar Launcher',
                'Clear your FiveM cache (AppData/Local/FiveM/FiveM.app/cache)',
                'Update your graphics drivers',
                'Disable any overlay software (Discord, GeForce Experience)'
            ]
        },
        {
            regex: /citizen-resources.*lua.*error/i,
            type: 'resource',
            cause: 'Lua Script Error',
            description: 'A server resource encountered a Lua scripting error.',
            solutions: [
                'This is a server-side resource issue',
                'The error has been logged for our development team',
                'Try reconnecting to the server',
                'If the issue persists, contact server staff'
            ]
        },
        {
            regex: /(\w+[-_]?\w*)\.lua:\d+:/i,
            type: 'resource',
            cause: 'Resource Script Error',
            extractResource: true,
            description: 'A specific resource script crashed.',
            solutions: [
                'This resource has been flagged for review',
                'Our dev team will investigate and fix the issue',
                'Try reconnecting to the server'
            ]
        },
        {
            regex: /out of memory|memory allocation failed/i,
            type: 'client',
            cause: 'Out of Memory',
            description: 'Your system ran out of available memory while running FiveM.',
            solutions: [
                'Close other applications to free up RAM',
                'Increase your Windows virtual memory/page file',
                'Consider upgrading your RAM if this happens frequently',
                'Lower your graphics settings in-game'
            ]
        },
        {
            regex: /nvwgf2umx\.dll|nvidia/i,
            type: 'client',
            cause: 'NVIDIA Graphics Driver Crash',
            description: 'Your NVIDIA graphics driver crashed.',
            solutions: [
                'Update to the latest NVIDIA drivers from nvidia.com',
                'Try rolling back to a previous driver version if recently updated',
                'Disable any NVIDIA overlay features',
                'Check your GPU temperatures for overheating'
            ]
        },
        {
            regex: /atixxxx\.dll|amd|radeon/i,
            type: 'client',
            cause: 'AMD Graphics Driver Crash',
            description: 'Your AMD graphics driver crashed.',
            solutions: [
                'Update to the latest AMD Adrenalin drivers',
                'Disable AMD ReLive and other overlay features',
                'Check your GPU temperatures',
                'Try disabling hardware acceleration in Discord'
            ]
        },
        {
            regex: /citizen-server-impl|server.*crash/i,
            type: 'resource',
            cause: 'Server-Side Crash',
            description: 'The server experienced an issue that caused your disconnect.',
            solutions: [
                'This is a server-side issue, not your fault',
                'Wait a moment and try reconnecting',
                'The issue has been logged for investigation'
            ]
        },
        {
            regex: /streaming.*failed|txd.*error|yft.*error|ydr.*error/i,
            type: 'resource',
            cause: 'Asset Streaming Error',
            description: 'Failed to load a game asset (texture, model, etc.)',
            solutions: [
                'Clear your FiveM cache',
                'This may be a corrupted server asset',
                'The issue has been reported to the dev team'
            ]
        },
        {
            regex: /weapon.*invalid|weapon.*error/i,
            type: 'resource',
            cause: 'Weapon Resource Error',
            description: 'A custom weapon resource caused a crash.',
            solutions: [
                'The weapon addon has been flagged for review',
                'Try reconnecting to the server',
                'Avoid using the problematic weapon until fixed'
            ]
        },
        {
            regex: /vehicle.*crash|handling.*error/i,
            type: 'resource',
            cause: 'Vehicle Resource Error',
            description: 'A custom vehicle resource caused a crash.',
            solutions: [
                'The vehicle addon has been flagged for review',
                'Avoid spawning the problematic vehicle until fixed',
                'Try reconnecting to the server'
            ]
        },
        {
            regex: /esx|qbcore|vorp/i,
            type: 'resource',
            cause: 'Framework Error',
            description: 'The server framework encountered an error.',
            solutions: [
                'This is a server configuration issue',
                'The framework error has been logged',
                'Try reconnecting in a few minutes'
            ]
        },
        {
            regex: /natives.*invalid|native.*not.*found/i,
            type: 'resource',
            cause: 'Invalid Native Call',
            description: 'A script tried to call an invalid game function.',
            solutions: [
                'This is a scripting error on the server',
                'The issue has been logged for our developers',
                'Try reconnecting to the server'
            ]
        }
    ],

    // Default response for unknown crashes
    unknown: {
        type: 'unknown',
        cause: 'Unknown Crash',
        description: 'The crash log doesn\'t match any known patterns.',
        solutions: [
            'Clear your FiveM cache (AppData/Local/FiveM/FiveM.app/cache)',
            'Verify your GTA V game files',
            'Update your graphics drivers',
            'Try restarting your computer',
            'If the issue persists, contact server staff with this crash log'
        ]
    }
};

// ===================================
// Path Copy & Open Handlers
// ===================================
const copyPathBtn = document.getElementById('copyPathBtn');
const openPathBtn = document.getElementById('openPathBtn');
const crashPath = document.getElementById('crashPath');

if (copyPathBtn) {
    copyPathBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(crashPath.textContent);
            copyPathBtn.classList.add('copied');

            // Change icon to checkmark temporarily
            copyPathBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            `;

            setTimeout(() => {
                copyPathBtn.classList.remove('copied');
                copyPathBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                `;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy path:', err);
        }
    });
}

if (openPathBtn) {
    openPathBtn.addEventListener('click', () => {
        // Show a helpful tooltip/message since we can't open folders directly
        const tooltip = document.createElement('div');
        tooltip.className = 'path-tooltip';
        tooltip.innerHTML = `
            <p>To open this folder:</p>
            <ol>
                <li>Press <kbd>Win</kbd> + <kbd>R</kbd></li>
                <li>Paste: <code>%LocalAppData%\\FiveM\\FiveM.app\\crashes</code></li>
                <li>Press Enter</li>
            </ol>
        `;
        tooltip.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--card-bg, #1f1f1f);
            border: 1px solid rgba(212, 165, 116, 0.3);
            border-radius: 10px;
            padding: 20px;
            z-index: 1000;
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
            animation: fadeIn 0.3s ease;
        `;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 999;
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(tooltip);

        // Copy path to clipboard automatically
        navigator.clipboard.writeText('%LocalAppData%\\FiveM\\FiveM.app\\crashes');

        overlay.addEventListener('click', () => {
            tooltip.remove();
            overlay.remove();
        });

        setTimeout(() => {
            tooltip.remove();
            overlay.remove();
        }, 5000);
    });
}

// ===================================
// File Upload Handling
// ===================================
uploadZone.addEventListener('click', () => crashLogInput.click());

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect(files[0]);
    }
});

crashLogInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

function handleFileSelect(file) {
    selectedFile = file;
    uploadZone.classList.add('has-file');
    const uploadContent = document.getElementById('uploadContent');
    if (uploadContent) {
        uploadContent.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <p>${file.name}</p>
        `;
    }
    analyzeBtn.disabled = false;
}

// ===================================
// API Configuration
// ===================================
// Use /api for both local (proxied through Vite) and production (Vercel)
const API_URL = '/api';

// ===================================
// Analyze Button Handler
// ===================================
analyzeBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    // Show loading state
    const btnText = analyzeBtn.querySelector('.btn-text');
    const btnLoading = analyzeBtn.querySelector('.btn-loading');
    btnText.hidden = true;
    btnLoading.hidden = false;
    analyzeBtn.disabled = true;

    // Add user message
    addMessage('user', `Uploaded crash log: ${selectedFile.name}`);

    try {
        // Read the file
        const content = await readFile(selectedFile);

        // Add thinking message
        addMessage('bot', 'Analyzing your crash log with Claude AI... This may take a moment.');

        // Call Claude API through our backend
        const response = await fetch(`${API_URL}/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ crashLog: content })
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.analysis) {
            // Convert API response to our format
            const analysis = {
                type: data.analysis.crash_type,
                cause: data.analysis.cause,
                description: data.analysis.description,
                solutions: data.analysis.solutions,
                resourceName: data.analysis.resource_name,
                severity: data.analysis.severity
            };

            // Remove the thinking message
            const messages = chatMessages.querySelectorAll('.message');
            if (messages.length > 0) {
                const lastMessage = messages[messages.length - 1];
                if (lastMessage.textContent.includes('Analyzing your crash log')) {
                    lastMessage.remove();
                }
            }

            // Add bot response with analysis
            addAnalysisMessage(analysis);

            // If it's a resource issue, log it to Firebase
            if (analysis.type === 'resource' && analysis.resourceName) {
                await logResourceIssue(analysis);
            }
        } else {
            throw new Error(data.error || 'Unknown error');
        }

    } catch (error) {
        console.error('Error analyzing crash log:', error);

        // Remove thinking message if present
        const messages = chatMessages.querySelectorAll('.message');
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.textContent.includes('Analyzing your crash log')) {
                lastMessage.remove();
            }
        }

        // Fall back to local analysis if API fails
        addMessage('bot', 'Claude API is unavailable. Using local analysis instead...');

        try {
            const content = await readFile(selectedFile);
            const analysis = analyzeCrashLog(content);
            addAnalysisMessage(analysis);

            if (analysis.type === 'resource' && analysis.resourceName) {
                await logResourceIssue(analysis);
            }
        } catch (fallbackError) {
            addMessage('bot', 'Sorry, I encountered an error analyzing your crash log. Please try again or contact server staff.');
        }
    }

    // Reset button state
    btnText.hidden = false;
    btnLoading.hidden = true;
    analyzeBtn.disabled = false;
});

// ===================================
// File Reading
// ===================================
function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

// ===================================
// Crash Log Analysis
// ===================================
function analyzeCrashLog(content) {
    const contentLower = content.toLowerCase();

    // Try to match known patterns
    for (const pattern of FIVEM_KNOWLEDGE.patterns) {
        const match = content.match(pattern.regex);
        if (match) {
            const analysis = {
                type: pattern.type,
                cause: pattern.cause,
                description: pattern.description,
                solutions: pattern.solutions,
                resourceName: null,
                rawMatch: match[0]
            };

            // Try to extract resource name if applicable
            if (pattern.extractResource || pattern.type === 'resource') {
                const resourceMatch = content.match(/\[(\w+[-_]?\w*)\]/i) ||
                                     content.match(/resources?[\/\\](\w+[-_]?\w*)/i) ||
                                     content.match(/(\w+[-_]?\w*)\.lua/i);
                if (resourceMatch) {
                    analysis.resourceName = resourceMatch[1];
                }
            }

            return analysis;
        }
    }

    // Return unknown if no patterns matched
    return {
        ...FIVEM_KNOWLEDGE.unknown,
        resourceName: null
    };
}

// ===================================
// Message Display
// ===================================
function addMessage(type, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = type === 'user' ? 'user-message' : 'bot-message';
    messageDiv.innerHTML = `<p>${content}</p>`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addAnalysisMessage(analysis) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'bot-message';

    const solutionsList = analysis.solutions.map(s => `<li>${s}</li>`).join('');
    const resourceInfo = analysis.resourceName
        ? `<p><strong>Resource:</strong> ${analysis.resourceName}</p>`
        : '';
    const reportInfo = analysis.type === 'resource' && analysis.resourceName
        ? `<p style="margin-top: 12px; padding: 10px; background: rgba(74, 222, 128, 0.1); border-radius: 6px; color: #4ade80; font-size: 13px;">This issue has been logged for our development team.</p>`
        : '';

    messageDiv.innerHTML = `
        <p>Analysis complete:</p>
        <div class="analysis-result">
            <div style="margin-bottom: 12px;">
                <span class="crash-type ${analysis.type}">${analysis.type}</span>
            </div>
            <h4>${analysis.cause}</h4>
            <p>${analysis.description}</p>
            ${resourceInfo}
            <h4 style="margin-top: 14px;">Solutions:</h4>
            <ul>${solutionsList}</ul>
            ${reportInfo}
        </div>
    `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ===================================
// Firebase Integration
// ===================================
async function logResourceIssue(analysis) {
    try {
        const issuesRef = collection(db, 'crashReports');

        // Check if this resource issue already exists
        const q = query(issuesRef, where('resourceName', '==', analysis.resourceName));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // Update existing issue - increment counter
            const existingDoc = querySnapshot.docs[0];
            await updateDoc(doc(db, 'crashReports', existingDoc.id), {
                crashCount: increment(1),
                lastReported: serverTimestamp()
            });
            console.log('Updated existing resource issue:', analysis.resourceName);
        } else {
            // Create new issue
            await addDoc(issuesRef, {
                resourceName: analysis.resourceName,
                cause: analysis.cause,
                description: analysis.description,
                crashCount: 1,
                status: 'pending',
                createdAt: serverTimestamp(),
                lastReported: serverTimestamp(),
                fixedAt: null,
                fixedBy: null
            });
            console.log('Logged new resource issue:', analysis.resourceName);
        }

        // Refresh the issues list
        await loadKnownIssues();

    } catch (error) {
        console.error('Error logging resource issue:', error);
    }
}

async function loadKnownIssues() {
    try {
        const issuesRef = collection(db, 'crashReports');
        const q = query(issuesRef, orderBy('crashCount', 'desc'));
        const querySnapshot = await getDocs(q);

        knownIssues = [];
        querySnapshot.forEach((doc) => {
            knownIssues.push({ id: doc.id, ...doc.data() });
        });

        renderKnownIssues();

    } catch (error) {
        console.error('Error loading known issues:', error);
        issuesList.innerHTML = `
            <div class="issues-loading">
                <span>Unable to load issues</span>
            </div>
        `;
        issueCount.textContent = '-';
    }
}

function renderKnownIssues() {
    if (knownIssues.length === 0) {
        issuesList.innerHTML = `
            <div class="issues-loading">
                <span>No known issues</span>
            </div>
        `;
        issueCount.textContent = '0';
        return;
    }

    const pendingCount = knownIssues.filter(i => i.status === 'pending').length;
    issueCount.textContent = pendingCount;

    issuesList.innerHTML = knownIssues.map(issue => `
        <div class="issue-item ${issue.status === 'fixed' ? 'fixed' : ''}">
            <div class="issue-name">${issue.resourceName}</div>
            <div class="issue-cause">${issue.cause}</div>
            <div class="issue-meta">
                <span class="issue-count">${issue.crashCount} ${issue.crashCount === 1 ? 'report' : 'reports'}</span>
                <span class="issue-status">${issue.status === 'fixed' ? 'Fixed' : 'Pending'}</span>
            </div>
        </div>
    `).join('');
}

// ===================================
// Developer Functions (for Discord integration)
// ===================================
// These functions can be called from a developer dashboard or Discord bot

window.markIssueFixed = async function(issueId, fixedBy) {
    try {
        await updateDoc(doc(db, 'crashReports', issueId), {
            status: 'fixed',
            fixedAt: serverTimestamp(),
            fixedBy: fixedBy
        });
        console.log('Issue marked as fixed:', issueId);
        await loadKnownIssues();
    } catch (error) {
        console.error('Error marking issue as fixed:', error);
    }
};

window.getIssuesPrioritized = function() {
    // Returns issues sorted by crash count (most crashes = highest priority)
    return knownIssues
        .filter(i => i.status !== 'fixed')
        .sort((a, b) => b.crashCount - a.crashCount);
};

// ===================================
// Initialize
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    loadKnownIssues();
});

console.log('🤖 CrashBot initialized');
console.log('📊 Use window.markIssueFixed(issueId, fixedBy) to mark issues as fixed');
console.log('📋 Use window.getIssuesPrioritized() to get prioritized issue list');

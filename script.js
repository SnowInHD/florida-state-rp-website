// ===================================
// Navigation
// ===================================
const navbar = document.getElementById('navbar');
const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');

// Scroll effect
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// Mobile toggle
if (navToggle) {
    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
    });
}

// Close mobile menu on link click
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        if (navToggle) navToggle.classList.remove('active');
        if (navMenu) navMenu.classList.remove('active');
    });
});

// ===================================
// Smooth Scroll
// ===================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;

        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            e.preventDefault();
            const navHeight = navbar ? navbar.offsetHeight : 0;
            window.scrollTo({
                top: targetElement.offsetTop - navHeight,
                behavior: 'smooth'
            });
        }
    });
});

// ===================================
// Auth State
// ===================================

// Determine base path based on current page location
function getBasePath() {
    const path = window.location.pathname;
    if (path.includes('/pages/')) {
        return '../../';
    }
    return '';
}

// Token refresh function for nav
async function refreshNavToken() {
    const refreshToken = localStorage.getItem('discord_refresh_token');
    if (!refreshToken) return false;

    try {
        const response = await fetch('/api/discord-refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        });

        const data = await response.json();

        if (data.success) {
            localStorage.setItem('discord_token', data.accessToken);
            localStorage.setItem('discord_refresh_token', data.refreshToken);
            localStorage.setItem('discord_user', JSON.stringify(data.user));
            localStorage.setItem('discord_roles', JSON.stringify(data.roleIds));
            localStorage.setItem('discord_in_guild', data.inGuild);
            return data.accessToken;
        }
    } catch (error) {
        console.error('Nav token refresh failed:', error);
    }
    return false;
}

async function updateNavAuth() {
    const navAuth = document.getElementById('navAuth');
    if (!navAuth) return;

    const basePath = getBasePath();
    let token = localStorage.getItem('discord_token');
    const user = JSON.parse(localStorage.getItem('discord_user') || 'null');

    if (token && user) {
        const avatar = user.avatar || '';
        const displayName = user.displayName || user.username || 'User';

        // Admin bypass IDs
        const ADMIN_BYPASS_IDS = ['208699485570859009'];

        // Check if user has dev role or admin access
        let isDev = false;
        let isAdmin = ADMIN_BYPASS_IDS.includes(user.id);

        // Use cached roles from localStorage (set during login/refresh)
        let userRoles = JSON.parse(localStorage.getItem('discord_roles') || '[]');

        // Only fetch from API if no cached roles exist
        if (userRoles.length === 0) {
            try {
                let response = await fetch('/api/discord-roles', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                // If token expired, try to refresh
                if (!response.ok && (response.status === 401 || response.status === 404)) {
                    const newToken = await refreshNavToken();
                    if (newToken) {
                        token = newToken;
                        // Roles are updated in refreshNavToken, get them from localStorage
                        userRoles = JSON.parse(localStorage.getItem('discord_roles') || '[]');
                    }
                } else if (response.ok) {
                    const data = await response.json();
                    userRoles = data.roles || [];
                    // Cache the roles
                    localStorage.setItem('discord_roles', JSON.stringify(userRoles));
                }
            } catch (e) {
                // Silently fail if can't check roles
            }
        }

        // Check permissions from Firestore for dynamic nav items
        try {
            const permResponse = await fetch(`https://firestore.googleapis.com/v1/projects/floridastaterp-1b9c2/databases/(default)/documents/permissions/pages`);
            console.log('=== NAV PERMISSIONS DEBUG ===');
            console.log('User roles:', userRoles);
            if (permResponse.ok) {
                const permData = await permResponse.json();
                console.log('Firestore permData:', permData);
                if (permData.fields) {
                    // Check devportal access
                    const devportalAccess = permData.fields?.devportal?.mapValue?.fields?.permissions?.mapValue?.fields?.access?.arrayValue?.values || [];
                    const devRoleIds = devportalAccess.map(v => v.stringValue);
                    console.log('DevPortal role IDs from Firestore:', devRoleIds);
                    console.log('User has devportal access:', userRoles.some(roleId => devRoleIds.includes(roleId)));
                    isDev = userRoles.some(roleId => devRoleIds.includes(roleId));

                    // Check admin access
                    const adminAccess = permData.fields?.admin?.mapValue?.fields?.permissions?.mapValue?.fields?.access?.arrayValue?.values || [];
                    const adminRoleIds = adminAccess.map(v => v.stringValue);
                    if (userRoles.some(roleId => adminRoleIds.includes(roleId))) {
                        isAdmin = true;
                    }
                }
            }

            // Also check if user is in adminUsers list
            const adminUsersResponse = await fetch(`https://firestore.googleapis.com/v1/projects/floridastaterp-1b9c2/databases/(default)/documents/permissions/adminUsers`);
            if (adminUsersResponse.ok) {
                const adminUsersData = await adminUsersResponse.json();
                const adminUserIds = adminUsersData.fields?.users?.arrayValue?.values?.map(v => v.stringValue) || [];
                if (adminUserIds.includes(user.id)) {
                    isAdmin = true;
                }
            }
        } catch (e) {
            // Silently fail if can't check Firestore permissions
        }

        // Build dropdown menu
        const devPortalItem = isDev ? `
            <a href="/devportal" class="nav-dropdown-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/>
                </svg>
                Dev Portal
            </a>
        ` : '';

        const adminItem = isAdmin ? `
            <a href="/admin" class="nav-dropdown-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                Admin Panel
            </a>
        ` : '';

        navAuth.innerHTML = `
            <div class="nav-user-container" id="navUserContainer">
                <div class="nav-user" id="navUserBtn">
                    ${avatar
                        ? `<img src="${avatar}" alt="Avatar" class="nav-user-avatar">`
                        : `<div class="nav-user-avatar" style="background: var(--gold); display: flex; align-items: center; justify-content: center; color: var(--dark); font-weight: bold;">${displayName.charAt(0).toUpperCase()}</div>`
                    }
                    <span class="nav-user-name">${displayName}</span>
                </div>
                <div class="nav-user-dropdown">
                    <a href="/settings" class="nav-dropdown-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                        Settings
                    </a>
                    ${devPortalItem}
                    ${adminItem}
                    <div class="nav-dropdown-divider"></div>
                    <button class="nav-dropdown-item logout" id="navLogoutBtn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                        Logout
                    </button>
                </div>
            </div>
        `;

        // Setup dropdown toggle
        const container = document.getElementById('navUserContainer');
        const btn = document.getElementById('navUserBtn');
        const logoutBtn = document.getElementById('navLogoutBtn');

        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                container.classList.toggle('open');
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (container && !container.contains(e.target)) {
                container.classList.remove('open');
            }
        });

        // Logout handler
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem('discord_token');
                localStorage.removeItem('discord_refresh_token');
                localStorage.removeItem('discord_user');
                localStorage.removeItem('discord_roles');
                localStorage.removeItem('discord_in_guild');
                window.location.href = '/';
            });
        }
    } else {
        navAuth.innerHTML = `<a href="/api/discord-login?redirect=true" class="nav-link nav-login">Login</a>`;
    }
}

// Run updateNavAuth once - prevent duplicate runs
let navAuthInitialized = false;
async function initNavAuth() {
    if (navAuthInitialized) return;
    navAuthInitialized = true;
    await updateNavAuth();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavAuth);
} else {
    initNavAuth();
}

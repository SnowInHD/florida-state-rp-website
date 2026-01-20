// ===================================
// Admin Panel - Firebase Integration
// ===================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyDzFNaCOtrrMVczIjUMAfh-InXjxKYhqdU",
    authDomain: "floridastaterp-1b9c2.firebaseapp.com",
    projectId: "floridastaterp-1b9c2",
    storageBucket: "floridastaterp-1b9c2.firebasestorage.app",
    messagingSenderId: "1071286531174",
    appId: "1:1071286531174:web:733600a43304540c9c69a7",
    measurementId: "G-NWQPCR02LN"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===================================
// Constants
// ===================================

// Admin bypass - these Discord IDs can always access admin panel
const ADMIN_BYPASS_IDS = ['208699485570859009'];

// Default page configurations
const DEFAULT_PAGES = {
    devportal: {
        name: 'Dev Portal',
        path: '/pages/devportal/',
        permissions: {
            access: [],
            approve: [],
            assign: []
        }
    },
    admin: {
        name: 'Admin Panel',
        path: '/pages/admin/',
        permissions: {
            access: []
        }
    }
};

// ===================================
// State
// ===================================

let currentUser = null;
let discordRoles = [];
let pagePermissions = {};
let adminUsers = [];

// ===================================
// DOM Elements
// ===================================

const accessDenied = document.getElementById('accessDenied');
const adminContent = document.getElementById('adminContent');
const adminFooter = document.getElementById('adminFooter');
const navButtons = document.querySelectorAll('.admin-nav-item');
const sections = {
    permissions: document.getElementById('sectionPermissions'),
    roles: document.getElementById('sectionRoles'),
    admins: document.getElementById('sectionAdmins')
};

// Modal elements
const editModal = document.getElementById('editPermissionModal');
const addPageModal = document.getElementById('addPageModal');

// ===================================
// Token Refresh
// ===================================

async function refreshToken() {
    const refreshToken = localStorage.getItem('discord_refresh_token');
    if (!refreshToken) return false;

    try {
        const response = await fetch('/api/discord/refresh', {
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
        console.error('Token refresh failed:', error);
    }
    return false;
}

// ===================================
// Auth & Access Check
// ===================================

async function checkAdminAccess() {
    let token = localStorage.getItem('discord_token');
    const user = JSON.parse(localStorage.getItem('discord_user') || 'null');

    if (!token || !user) {
        window.location.href = '/api/discord/login?redirect=true';
        return false;
    }

    currentUser = user;

    // Check if user has admin bypass
    if (ADMIN_BYPASS_IDS.includes(user.id)) {
        return true;
    }

    // Load admin users from Firestore and check if user is in admin list
    try {
        const adminsDoc = await getDoc(doc(db, 'permissions', 'adminUsers'));
        if (adminsDoc.exists()) {
            adminUsers = adminsDoc.data().users || [];
            if (adminUsers.includes(user.id)) {
                return true;
            }
        }
    } catch (error) {
        console.error('Error loading admin users:', error);
    }

    // Check role-based access
    try {
        let response = await fetch('/api/discord/roles', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok && (response.status === 401 || response.status === 404)) {
            const newToken = await refreshToken();
            if (newToken) {
                token = newToken;
                response = await fetch('/api/discord/roles', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            }
        }

        if (response.ok) {
            const data = await response.json();
            const userRoles = data.roles || [];

            // Load admin page permissions
            const adminPerms = await getDoc(doc(db, 'permissions', 'pages'));
            if (adminPerms.exists()) {
                const pages = adminPerms.data();
                if (pages.admin && pages.admin.permissions && pages.admin.permissions.access) {
                    const hasAccess = userRoles.some(roleId =>
                        pages.admin.permissions.access.includes(roleId)
                    );
                    if (hasAccess) return true;
                }
            }
        }
    } catch (error) {
        console.error('Error checking roles:', error);
    }

    return false;
}

// ===================================
// Initialize
// ===================================

async function init() {
    const hasAccess = await checkAdminAccess();

    if (hasAccess) {
        accessDenied.hidden = true;
        adminContent.hidden = false;
        adminFooter.hidden = false;

        // Setup navigation
        setupNavigation();

        // Load data
        await Promise.all([
            loadDiscordRoles(),
            loadPermissions(),
            loadAdminUsers()
        ]);

        // Setup modals
        setupModals();
    } else {
        accessDenied.hidden = false;
        adminContent.hidden = true;
        adminFooter.hidden = true;
    }
}

// ===================================
// Navigation
// ===================================

function setupNavigation() {
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;

            // Update active state
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show selected section
            Object.keys(sections).forEach(key => {
                sections[key].hidden = key !== section;
            });
        });
    });
}

// ===================================
// Load Discord Roles
// ===================================

async function loadDiscordRoles() {
    let token = localStorage.getItem('discord_token');

    try {
        let response = await fetch('/api/discord/guild-roles', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok && (response.status === 401 || response.status === 404)) {
            const newToken = await refreshToken();
            if (newToken) {
                token = newToken;
                response = await fetch('/api/discord/guild-roles', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            }
        }

        if (response.ok) {
            const data = await response.json();
            discordRoles = data.roles || [];
            renderRolesGrid();
        }
    } catch (error) {
        console.error('Error loading Discord roles:', error);
    }
}

function renderRolesGrid() {
    const grid = document.getElementById('rolesGrid');

    if (discordRoles.length === 0) {
        grid.innerHTML = '<p class="loading-spinner">No roles found</p>';
        return;
    }

    // Sort roles by position (highest first)
    const sortedRoles = [...discordRoles].sort((a, b) => b.position - a.position);

    grid.innerHTML = sortedRoles.map(role => {
        const color = role.color ? `#${role.color.toString(16).padStart(6, '0')}` : '#99aab5';
        return `
            <div class="role-card">
                <div class="role-color" style="background: ${color}"></div>
                <div>
                    <div class="role-name">${escapeHtml(role.name)}</div>
                    <div class="role-id">${role.id}</div>
                </div>
            </div>
        `;
    }).join('');
}

// ===================================
// Load Permissions
// ===================================

async function loadPermissions() {
    try {
        const pagesDoc = await getDoc(doc(db, 'permissions', 'pages'));

        if (pagesDoc.exists()) {
            pagePermissions = pagesDoc.data();
        } else {
            // Initialize with defaults
            pagePermissions = { ...DEFAULT_PAGES };
            await setDoc(doc(db, 'permissions', 'pages'), pagePermissions);
        }

        renderPermissionsList();
    } catch (error) {
        console.error('Error loading permissions:', error);
    }
}

function renderPermissionsList() {
    const list = document.getElementById('permissionsList');
    const pages = Object.keys(pagePermissions);

    let html = '';

    pages.forEach(pageId => {
        const page = pagePermissions[pageId];
        const perms = page.permissions || {};

        html += `
            <div class="permission-card" data-page="${pageId}">
                <div class="permission-header">
                    <div class="permission-info">
                        <h3>${escapeHtml(page.name)}</h3>
                        <span class="permission-path">${escapeHtml(page.path)}</span>
                    </div>
                    <button class="btn btn-secondary btn-small" onclick="editPermission('${pageId}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        Edit
                    </button>
                </div>
                <div class="permission-roles">
                    <div class="role-group">
                        <span class="role-label">Access:</span>
                        <div class="role-tags">${renderRoleTags(perms.access || [])}</div>
                    </div>
                    ${perms.approve !== undefined ? `
                    <div class="role-group">
                        <span class="role-label">Can Approve:</span>
                        <div class="role-tags">${renderRoleTags(perms.approve || [])}</div>
                    </div>
                    ` : ''}
                    ${perms.assign !== undefined ? `
                    <div class="role-group">
                        <span class="role-label">Can Assign:</span>
                        <div class="role-tags">${renderRoleTags(perms.assign || [])}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    });

    // Add new page button
    html += `
        <button class="add-page-btn" id="addPageBtn" onclick="openAddPageModal()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add New Page
        </button>
    `;

    list.innerHTML = html;
}

function renderRoleTags(roleIds) {
    if (!roleIds || roleIds.length === 0) {
        return '<span class="role-tag no-roles">No roles assigned</span>';
    }

    return roleIds.map(roleId => {
        const role = discordRoles.find(r => r.id === roleId);
        const roleName = role ? role.name : roleId;
        return `<span class="role-tag">${escapeHtml(roleName)}</span>`;
    }).join('');
}

// ===================================
// Load Admin Users
// ===================================

async function loadAdminUsers() {
    try {
        const adminsDoc = await getDoc(doc(db, 'permissions', 'adminUsers'));

        if (adminsDoc.exists()) {
            adminUsers = adminsDoc.data().users || [];
        } else {
            // Initialize with bypass IDs
            adminUsers = [...ADMIN_BYPASS_IDS];
            await setDoc(doc(db, 'permissions', 'adminUsers'), { users: adminUsers });
        }

        renderAdminsList();
    } catch (error) {
        console.error('Error loading admin users:', error);
    }
}

function renderAdminsList() {
    const list = document.getElementById('adminsList');

    if (adminUsers.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted);">No admin users configured.</p>';
        return;
    }

    list.innerHTML = adminUsers.map(userId => {
        const isBypass = ADMIN_BYPASS_IDS.includes(userId);
        return `
            <div class="admin-item">
                <div class="admin-info">
                    <div class="admin-avatar">${userId.slice(-2).toUpperCase()}</div>
                    <div class="admin-details">
                        <span class="admin-name">Discord User</span>
                        <span class="admin-id">${userId}</span>
                    </div>
                    ${isBypass ? '<span class="admin-badge">System Admin</span>' : ''}
                </div>
                ${!isBypass ? `
                <button class="remove-admin-btn" onclick="removeAdmin('${userId}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
                ` : ''}
            </div>
        `;
    }).join('');
}

// ===================================
// Modal Setup
// ===================================

function setupModals() {
    // Edit permission modal
    document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
    document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
    document.getElementById('savePermissionBtn').addEventListener('click', savePermissions);
    editModal.querySelector('.modal-backdrop').addEventListener('click', closeEditModal);

    // Add page modal
    document.getElementById('closeAddPageModal').addEventListener('click', closeAddPageModal);
    document.getElementById('cancelAddPage').addEventListener('click', closeAddPageModal);
    document.getElementById('addPageForm').addEventListener('submit', handleAddPage);
    addPageModal.querySelector('.modal-backdrop').addEventListener('click', closeAddPageModal);

    // Add admin button
    document.getElementById('addAdminBtn').addEventListener('click', handleAddAdmin);
}

// ===================================
// Edit Permission Modal
// ===================================

window.editPermission = function(pageId) {
    const page = pagePermissions[pageId];
    if (!page) return;

    document.getElementById('editPageId').value = pageId;
    document.getElementById('editModalTitle').textContent = `Edit Permissions - ${page.name}`;

    const perms = page.permissions || {};

    // Render role selectors
    renderRoleSelector('accessRoleSelector', perms.access || []);

    // Show/hide approve and assign sections based on page config
    const approveSection = document.getElementById('approveSection');
    const assignSection = document.getElementById('assignSection');

    if (perms.approve !== undefined) {
        approveSection.hidden = false;
        renderRoleSelector('approveRoleSelector', perms.approve || []);
    } else {
        approveSection.hidden = true;
    }

    if (perms.assign !== undefined) {
        assignSection.hidden = false;
        renderRoleSelector('assignRoleSelector', perms.assign || []);
    } else {
        assignSection.hidden = true;
    }

    editModal.hidden = false;
};

function renderRoleSelector(containerId, selectedRoles) {
    const container = document.getElementById(containerId);

    // Sort roles by position
    const sortedRoles = [...discordRoles].sort((a, b) => b.position - a.position);

    container.innerHTML = sortedRoles.map(role => {
        const color = role.color ? `#${role.color.toString(16).padStart(6, '0')}` : '#99aab5';
        const checked = selectedRoles.includes(role.id) ? 'checked' : '';
        return `
            <input type="checkbox" class="role-checkbox" id="${containerId}-${role.id}" value="${role.id}" ${checked}>
            <label for="${containerId}-${role.id}" class="role-checkbox-label">
                <span class="role-checkbox-color" style="background: ${color}"></span>
                ${escapeHtml(role.name)}
            </label>
        `;
    }).join('');
}

function closeEditModal() {
    editModal.hidden = true;
}

async function savePermissions() {
    const pageId = document.getElementById('editPageId').value;
    const page = pagePermissions[pageId];
    if (!page) return;

    // Get selected roles
    const accessRoles = getSelectedRoles('accessRoleSelector');

    page.permissions.access = accessRoles;

    if (page.permissions.approve !== undefined) {
        page.permissions.approve = getSelectedRoles('approveRoleSelector');
    }

    if (page.permissions.assign !== undefined) {
        page.permissions.assign = getSelectedRoles('assignRoleSelector');
    }

    try {
        await setDoc(doc(db, 'permissions', 'pages'), pagePermissions);
        renderPermissionsList();
        closeEditModal();
    } catch (error) {
        console.error('Error saving permissions:', error);
        alert('Failed to save permissions. Please try again.');
    }
}

function getSelectedRoles(containerId) {
    const container = document.getElementById(containerId);
    const checkboxes = container.querySelectorAll('.role-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// ===================================
// Add Page Modal
// ===================================

window.openAddPageModal = function() {
    document.getElementById('addPageForm').reset();
    addPageModal.hidden = false;
};

function closeAddPageModal() {
    addPageModal.hidden = true;
}

async function handleAddPage(e) {
    e.preventDefault();

    const pageId = document.getElementById('newPageId').value.toLowerCase().trim();
    const pageName = document.getElementById('newPageName').value.trim();
    const pagePath = document.getElementById('newPagePath').value.trim();
    const hasApprove = document.getElementById('hasApprove').checked;
    const hasAssign = document.getElementById('hasAssign').checked;

    if (pagePermissions[pageId]) {
        alert('A page with this ID already exists.');
        return;
    }

    const newPage = {
        name: pageName,
        path: pagePath,
        permissions: {
            access: []
        }
    };

    if (hasApprove) {
        newPage.permissions.approve = [];
    }

    if (hasAssign) {
        newPage.permissions.assign = [];
    }

    pagePermissions[pageId] = newPage;

    try {
        await setDoc(doc(db, 'permissions', 'pages'), pagePermissions);
        renderPermissionsList();
        closeAddPageModal();
    } catch (error) {
        console.error('Error adding page:', error);
        alert('Failed to add page. Please try again.');
    }
}

// ===================================
// Admin User Management
// ===================================

async function handleAddAdmin() {
    const input = document.getElementById('newAdminId');
    const userId = input.value.trim();

    if (!userId) {
        alert('Please enter a Discord User ID.');
        return;
    }

    if (!/^\d+$/.test(userId)) {
        alert('Invalid Discord User ID. It should be a number.');
        return;
    }

    if (adminUsers.includes(userId)) {
        alert('This user is already an admin.');
        return;
    }

    adminUsers.push(userId);

    try {
        await setDoc(doc(db, 'permissions', 'adminUsers'), { users: adminUsers });
        renderAdminsList();
        input.value = '';
    } catch (error) {
        console.error('Error adding admin:', error);
        alert('Failed to add admin. Please try again.');
    }
}

window.removeAdmin = async function(userId) {
    if (ADMIN_BYPASS_IDS.includes(userId)) {
        alert('Cannot remove system admin.');
        return;
    }

    if (!confirm('Are you sure you want to remove this admin?')) {
        return;
    }

    adminUsers = adminUsers.filter(id => id !== userId);

    try {
        await setDoc(doc(db, 'permissions', 'adminUsers'), { users: adminUsers });
        renderAdminsList();
    } catch (error) {
        console.error('Error removing admin:', error);
        alert('Failed to remove admin. Please try again.');
    }
};

// ===================================
// Utility Functions
// ===================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===================================
// Initialize on DOM Ready
// ===================================

document.addEventListener('DOMContentLoaded', init);

// ===================================
// Dev Portal - Task Management
// ===================================
import { db, storage } from '../../firebase-config.js';
import {
    collection,
    addDoc,
    getDocs,
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    where,
    onSnapshot,
    serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// ===================================
// Configuration
// ===================================
const API_URL = '/api';

// Admin bypass - these users get full access without being in the team list
const ADMIN_BYPASS_IDS = ['208699485570859009'];

// Dynamic permissions loaded from Firestore
let DEV_ROLE_IDS = [];
let APPROVE_ROLE_IDS = [];
let ASSIGN_ROLE_IDS = [];
let ADMIN_ROLE_IDS = [];

// ===================================
// State
// ===================================
let currentUser = null;
let userRoles = [];
let canApprove = false;
let canAssign = false;
let tasks = [];
let teamMembers = [];
let selectedTask = null;
let guildRoles = [];

// DOM Elements
const accessDenied = document.getElementById('accessDenied');
const portalContent = document.getElementById('portalContent');
const portalFooter = document.getElementById('portalFooter');

// ===================================
// Initialization
// ===================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAccess();
});

// ===================================
// Access Control
// ===================================

// Token refresh function
async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('discord_refresh_token');
    if (!refreshToken) return false;

    try {
        const response = await fetch(`${API_URL}/discord-refresh`, {
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

async function checkAccess() {
    let token = localStorage.getItem('discord_token');
    const user = JSON.parse(localStorage.getItem('discord_user') || 'null');

    console.log('=== DEV PORTAL ACCESS DEBUG ===');
    console.log('Token exists:', !!token);
    console.log('User:', user);

    if (!token || !user) {
        window.location.href = '/api/discord-login?redirect=true';
        return;
    }

    currentUser = user;

    try {
        // Load permissions from Firestore first
        await loadPermissions();
        console.log('DEV_ROLE_IDS loaded:', DEV_ROLE_IDS);

        // Use cached roles from localStorage first (set during login/refresh)
        userRoles = JSON.parse(localStorage.getItem('discord_roles') || '[]');
        console.log('Cached userRoles:', userRoles);

        // Only fetch from API if no cached roles exist
        if (userRoles.length === 0) {
            let response = await fetch(`${API_URL}/discord-roles`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            // If token expired, try to refresh
            if (!response.ok && (response.status === 401 || response.status === 404)) {
                const newToken = await refreshAccessToken();
                if (newToken) {
                    token = newToken;
                    currentUser = JSON.parse(localStorage.getItem('discord_user') || 'null');
                    // Roles are updated in refreshAccessToken
                    userRoles = JSON.parse(localStorage.getItem('discord_roles') || '[]');
                } else {
                    window.location.href = '/api/discord-login?redirect=true';
                    return;
                }
            } else if (response.ok) {
                const data = await response.json();
                userRoles = data.roles || [];
                localStorage.setItem('discord_roles', JSON.stringify(userRoles));
            } else {
                console.error('API error:', response.status);
                showAccessDenied();
                return;
            }
        }

        // Check if user is an admin (bypass ID or admin role)
        const isAdmin = ADMIN_BYPASS_IDS.includes(currentUser.id) ||
                        userRoles.some(roleId => ADMIN_ROLE_IDS.includes(roleId));
        console.log('Is admin:', isAdmin);

        // Check if user has access role OR is an admin
        const hasDevAccess = userRoles.some(roleId => DEV_ROLE_IDS.includes(roleId));
        const hasAccess = hasDevAccess || isAdmin;
        console.log('Has dev access:', hasDevAccess);
        console.log('Has access (including admin):', hasAccess);
        console.log('Matching dev roles:', userRoles.filter(roleId => DEV_ROLE_IDS.includes(roleId)));

        // Check if user can approve (based on approve roles OR is admin)
        canApprove = isAdmin || userRoles.some(roleId => APPROVE_ROLE_IDS.includes(roleId));

        // Check if user can assign (based on assign roles OR is admin)
        canAssign = isAdmin || userRoles.some(roleId => ASSIGN_ROLE_IDS.includes(roleId));

        console.log('Can approve:', canApprove);
        console.log('Can assign:', canAssign);

        if (!hasAccess) {
            console.log('Access denied - no matching roles and not admin');
            showAccessDenied();
            return;
        }

        // User has access - show portal
        console.log('Calling showPortal()...');
        showPortal();
        console.log('Portal shown, calling initializePortal()...');
        await initializePortal();
        console.log('Portal initialized successfully');

    } catch (error) {
        console.error('Access check failed:', error);
        console.error('Error stack:', error.stack);
        showAccessDenied();
    }
}

async function loadPermissions() {
    try {
        const pagesDoc = await getDoc(doc(db, 'permissions', 'pages'));

        if (pagesDoc.exists()) {
            const pages = pagesDoc.data();
            const devportalPerms = pages.devportal?.permissions || {};
            const adminPerms = pages.admin?.permissions || {};

            // Set role IDs from Firestore
            DEV_ROLE_IDS = devportalPerms.access || [];
            APPROVE_ROLE_IDS = devportalPerms.approve || [];
            ASSIGN_ROLE_IDS = devportalPerms.assign || [];
            ADMIN_ROLE_IDS = adminPerms.access || [];
        }
    } catch (error) {
        console.error('Error loading permissions:', error);
        // Fall back to empty - no access if permissions can't be loaded
        DEV_ROLE_IDS = [];
        APPROVE_ROLE_IDS = [];
        ASSIGN_ROLE_IDS = [];
        ADMIN_ROLE_IDS = [];
    }
}

function showAccessDenied() {
    accessDenied.hidden = false;
    portalContent.hidden = true;
    portalFooter.hidden = true;
}

function showPortal() {
    accessDenied.hidden = true;
    portalContent.hidden = false;
    portalFooter.hidden = false;
}

// ===================================
// Portal Initialization
// ===================================
async function initializePortal() {
    // Load guild roles for displaying names
    await loadGuildRoles();

    // Load team members
    await loadTeamMembers();

    // Setup event listeners
    setupEventListeners();

    // Initialize custom dropdowns
    initCustomDropdowns();

    // Load tasks (with real-time updates)
    setupTasksListener();
}

async function loadGuildRoles() {
    try {
        const response = await fetch(`${API_URL}/discord-guild-roles`);
        if (response.ok) {
            const data = await response.json();
            guildRoles = data.roles || [];
        }
    } catch (error) {
        console.error('Failed to load guild roles:', error);
    }
}

async function loadTeamMembers() {
    const teamList = document.getElementById('teamList');
    teamList.innerHTML = '<div class="loading-small">Loading team...</div>';

    // Start with current user
    teamMembers = [{
        id: currentUser.id,
        username: currentUser.displayName || currentUser.username,
        avatar: currentUser.avatar,
        canApprove: canApprove
    }];

    try {
        // Fetch all members with dev roles
        const roleIdsParam = DEV_ROLE_IDS.join(',');
        console.log('Fetching dev team with roles:', roleIdsParam);
        const response = await fetch(`${API_URL}/discord-dev-team?roles=${roleIdsParam}`);
        console.log('Dev team response status:', response.status);

        if (response.ok) {
            const data = await response.json();
            console.log('Dev team members found:', data.members?.length || 0);
            console.log('Raw member data:', data.members);

            if (data.members && data.members.length > 0) {
                // Replace teamMembers with fetched data (includes everyone with dev roles)
                teamMembers = data.members.map(member => ({
                    id: member.id,
                    username: member.displayName || member.username,
                    avatar: member.avatar,
                    canApprove: APPROVE_ROLE_IDS.some(roleId => member.roles?.includes(roleId))
                }));
                console.log('Processed team members:', teamMembers);
            }
        } else {
            const errorData = await response.text();
            console.error('Dev team API error:', response.status, errorData);
        }
    } catch (error) {
        console.error('Failed to load team members:', error);
    }

    renderTeamList();
    populateAssigneeDropdowns();
}

function renderTeamList() {
    const teamList = document.getElementById('teamList');

    if (teamMembers.length === 0) {
        teamList.innerHTML = '<div class="loading-small">No team members</div>';
        return;
    }

    teamList.innerHTML = teamMembers.map(member => `
        <div class="team-member">
            <div class="team-avatar">
                ${member.avatar
                    ? `<img src="${member.avatar}" alt="${member.username}">`
                    : member.username.charAt(0).toUpperCase()
                }
            </div>
            <span class="team-name">${member.username}</span>
            ${member.canApprove ? '<span class="team-role">Lead</span>' : ''}
        </div>
    `).join('');
}

function populateAssigneeDropdowns() {
    const dropdowns = [
        document.getElementById('taskAssignee'),
        document.getElementById('changeAssignee')
    ];

    dropdowns.forEach(dropdown => {
        if (!dropdown) return;

        // Keep first option (unassigned/placeholder)
        const firstOption = dropdown.options[0];
        dropdown.innerHTML = '';
        dropdown.appendChild(firstOption);

        teamMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = member.id;
            option.textContent = member.username;
            dropdown.appendChild(option);
        });

        // Update custom dropdown if it exists
        if (dropdown.dataset.customized) {
            updateCustomDropdownOptions(dropdown);
        }
    });
}

// ===================================
// Tasks
// ===================================
function setupTasksListener() {
    const tasksRef = collection(db, 'devTasks');
    const q = query(tasksRef, orderBy('createdAt', 'desc'));

    onSnapshot(q, (snapshot) => {
        tasks = [];
        snapshot.forEach(doc => {
            tasks.push({ id: doc.id, ...doc.data() });
        });

        // Update team members from tasks
        updateTeamFromTasks();

        // Render board
        renderKanbanBoard();
        updateStats();
    }, (error) => {
        console.error('Error listening to tasks:', error);
    });
}

function updateTeamFromTasks() {
    // Start with existing team members (from API)
    const userMap = new Map();

    // Preserve existing team members loaded from API
    teamMembers.forEach(member => {
        userMap.set(member.id, member);
    });

    // Ensure current user is included
    if (!userMap.has(currentUser.id)) {
        userMap.set(currentUser.id, {
            id: currentUser.id,
            username: currentUser.displayName || currentUser.username,
            avatar: currentUser.avatar,
            canApprove: canApprove
        });
    }

    // Add any additional users from tasks that aren't already in the team
    tasks.forEach(task => {
        if (task.createdBy && !userMap.has(task.createdBy.id)) {
            userMap.set(task.createdBy.id, {
                ...task.createdBy,
                canApprove: false
            });
        }
        if (task.assignedTo && !userMap.has(task.assignedTo.id)) {
            userMap.set(task.assignedTo.id, {
                ...task.assignedTo,
                canApprove: false
            });
        }
    });

    teamMembers = Array.from(userMap.values());
    renderTeamList();
    populateAssigneeDropdowns();
}

function renderKanbanBoard() {
    const columns = {
        todo: document.getElementById('columnTodo'),
        in_progress: document.getElementById('columnProgress'),
        review: document.getElementById('columnReview'),
        completed: document.getElementById('columnCompleted')
    };

    const counts = {
        todo: 0,
        in_progress: 0,
        review: 0,
        completed: 0
    };

    // Clear columns
    Object.values(columns).forEach(col => col.innerHTML = '');

    // Apply filters
    const filterAssignee = document.getElementById('filterAssignee').value;
    const filterPriority = document.getElementById('filterPriority').value;

    let filteredTasks = tasks;

    if (filterAssignee === 'me') {
        filteredTasks = filteredTasks.filter(t => t.assignedTo?.id === currentUser.id);
    } else if (filterAssignee === 'unassigned') {
        filteredTasks = filteredTasks.filter(t => !t.assignedTo);
    }

    if (filterPriority) {
        filteredTasks = filteredTasks.filter(t => t.priority === filterPriority);
    }

    // Render tasks
    filteredTasks.forEach(task => {
        const status = task.status || 'todo';
        if (columns[status]) {
            columns[status].appendChild(createTaskCard(task));
            counts[status]++;
        }
    });

    // Update counts
    document.getElementById('countTodo').textContent = counts.todo;
    document.getElementById('countProgress').textContent = counts.in_progress;
    document.getElementById('countReview').textContent = counts.review;
    document.getElementById('countCompleted').textContent = counts.completed;

    // Show empty state
    Object.entries(columns).forEach(([status, col]) => {
        if (col.children.length === 0) {
            col.innerHTML = '<div class="column-empty">No tasks</div>';
        }
    });

    // Setup drag and drop
    setupDragAndDrop();
}

function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = `task-card priority-${task.priority || 'medium'}`;
    card.draggable = true;
    card.dataset.taskId = task.id;

    const assignee = task.assignedTo;
    const commentCount = task.commentCount || 0;

    card.innerHTML = `
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta">
            <div class="task-assignee">
                ${assignee ? `
                    <div class="task-assignee-avatar">
                        ${assignee.avatar
                            ? `<img src="${assignee.avatar}" alt="${assignee.username}">`
                            : assignee.username.charAt(0).toUpperCase()
                        }
                    </div>
                    <span class="task-assignee-name">${assignee.username}</span>
                ` : '<span class="task-assignee-name" style="opacity: 0.5">Unassigned</span>'}
            </div>
            <div class="task-info">
                ${commentCount > 0 ? `
                    <span class="task-comments">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        ${commentCount}
                    </span>
                ` : ''}
            </div>
        </div>
    `;

    card.addEventListener('click', () => openTaskDetail(task.id));

    return card;
}

function updateStats() {
    const counts = {
        todo: tasks.filter(t => t.status === 'todo').length,
        in_progress: tasks.filter(t => t.status === 'in_progress').length,
        review: tasks.filter(t => t.status === 'review').length,
        completed: tasks.filter(t => t.status === 'completed').length
    };

    document.getElementById('statTodo').textContent = counts.todo;
    document.getElementById('statProgress').textContent = counts.in_progress;
    document.getElementById('statReview').textContent = counts.review;
    document.getElementById('statCompleted').textContent = counts.completed;
}

// ===================================
// Drag and Drop
// ===================================
function setupDragAndDrop() {
    const cards = document.querySelectorAll('.task-card');
    const columns = document.querySelectorAll('.column-tasks');

    cards.forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
    });

    columns.forEach(column => {
        column.addEventListener('dragover', handleDragOver);
        column.addEventListener('drop', handleDrop);
        column.addEventListener('dragleave', handleDragLeave);
    });
}

let draggedTask = null;

function handleDragStart(e) {
    draggedTask = e.target;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    document.querySelectorAll('.column-tasks').forEach(col => {
        col.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    if (!draggedTask) return;

    const taskId = draggedTask.dataset.taskId;
    const newStatus = e.currentTarget.closest('.kanban-column').dataset.status;

    // Don't allow non-head devs to approve (move to completed from review)
    const task = tasks.find(t => t.id === taskId);
    if (task && task.status === 'review' && newStatus === 'completed' && !canApprove) {
        alert('Only Head Dev can approve tasks.');
        return;
    }

    try {
        await updateDoc(doc(db, 'devTasks', taskId), {
            status: newStatus,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error('Error updating task status:', error);
    }
}

// ===================================
// Task Detail
// ===================================
async function openTaskDetail(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    selectedTask = task;

    const slideout = document.getElementById('taskSlideout');

    // Populate details
    document.getElementById('detailTitle').textContent = task.title;
    document.getElementById('detailDescription').textContent = task.description || 'No description provided.';

    const statusBadge = document.getElementById('detailStatus');
    statusBadge.textContent = formatStatus(task.status);
    statusBadge.className = `task-status-badge ${task.status}`;

    const priorityBadge = document.getElementById('detailPriority');
    priorityBadge.textContent = task.priority ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1) : 'Medium';
    priorityBadge.className = `priority-badge ${task.priority || 'medium'}`;

    // Assignee
    const assigneeDiv = document.getElementById('detailAssignee');
    if (task.assignedTo) {
        assigneeDiv.innerHTML = `
            ${task.assignedTo.avatar ? `<img src="${task.assignedTo.avatar}" alt="${task.assignedTo.username}">` : ''}
            <span>${task.assignedTo.username}</span>
        `;
    } else {
        assigneeDiv.innerHTML = '<span class="unassigned">Unassigned</span>';
    }

    // Creator
    const creatorDiv = document.getElementById('detailCreator');
    if (task.createdBy) {
        creatorDiv.textContent = task.createdBy.username;
    } else {
        creatorDiv.textContent = '-';
    }

    // Created date
    const createdSpan = document.getElementById('detailCreated');
    if (task.createdAt) {
        const date = task.createdAt.toDate ? task.createdAt.toDate() : new Date(task.createdAt);
        createdSpan.textContent = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    // Review notes
    const reviewNotesSection = document.getElementById('reviewNotesSection');
    if (task.reviewNotes) {
        reviewNotesSection.hidden = false;
        document.getElementById('detailReviewNotes').textContent = task.reviewNotes;
    } else {
        reviewNotesSection.hidden = true;
    }

    // Action buttons
    updateActionButtons(task);

    // Load comments
    await loadComments(taskId);

    // Load attachments
    await loadAttachments(taskId);

    // Show slideout
    slideout.hidden = false;
}

function formatStatus(status) {
    const labels = {
        todo: 'Todo',
        in_progress: 'In Progress',
        review: 'Review',
        completed: 'Completed'
    };
    return labels[status] || status;
}

function updateActionButtons(task) {
    const submitReviewBtn = document.getElementById('submitReviewBtn');
    const approveBtn = document.getElementById('approveBtn');
    const requestChangesBtn = document.getElementById('requestChangesBtn');
    const markCompleteBtn = document.getElementById('markCompleteBtn');

    // Hide all first
    submitReviewBtn.hidden = true;
    approveBtn.hidden = true;
    requestChangesBtn.hidden = true;
    markCompleteBtn.hidden = true;

    // Show based on status and role
    if (task.status === 'in_progress') {
        submitReviewBtn.hidden = false;
    }

    if (task.status === 'review' && canApprove) {
        approveBtn.hidden = false;
        requestChangesBtn.hidden = false;
    }

    if (task.status === 'completed' || (task.status === 'review' && !canApprove)) {
        // No actions available
    }
}

function closeTaskDetail() {
    document.getElementById('taskSlideout').hidden = true;
    selectedTask = null;
}

// ===================================
// Comments
// ===================================
async function loadComments(taskId) {
    const commentsList = document.getElementById('commentsList');
    commentsList.innerHTML = '<div class="loading-small">Loading comments...</div>';

    try {
        const commentsRef = collection(db, 'devTaskComments');
        const q = query(commentsRef, where('taskId', '==', taskId), orderBy('createdAt', 'asc'));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            commentsList.innerHTML = '<div class="no-comments">No comments yet.</div>';
            return;
        }

        commentsList.innerHTML = '';
        snapshot.forEach(doc => {
            const comment = doc.data();
            commentsList.appendChild(createCommentElement(comment));
        });

        // Scroll to bottom
        commentsList.scrollTop = commentsList.scrollHeight;

    } catch (error) {
        console.error('Error loading comments:', error);
        commentsList.innerHTML = '<div class="no-comments">Failed to load comments.</div>';
    }
}

function createCommentElement(comment) {
    const div = document.createElement('div');
    div.className = 'comment';

    const date = comment.createdAt?.toDate ? comment.createdAt.toDate() : new Date();
    const timeAgo = getTimeAgo(date);

    div.innerHTML = `
        <div class="comment-avatar">
            ${comment.author?.avatar
                ? `<img src="${comment.author.avatar}" alt="${comment.author.username}">`
                : (comment.author?.username?.charAt(0).toUpperCase() || '?')
            }
        </div>
        <div class="comment-body">
            <div class="comment-header">
                <span class="comment-author">${comment.author?.username || 'Unknown'}</span>
                <span class="comment-time">${timeAgo}</span>
            </div>
            <div class="comment-content">${escapeHtml(comment.content)}</div>
        </div>
    `;

    return div;
}

async function addComment() {
    if (!selectedTask) return;

    const input = document.getElementById('commentInput');
    const content = input.value.trim();

    if (!content) return;

    try {
        await addDoc(collection(db, 'devTaskComments'), {
            taskId: selectedTask.id,
            content: content,
            author: {
                id: currentUser.id,
                username: currentUser.displayName || currentUser.username,
                avatar: currentUser.avatar
            },
            createdAt: serverTimestamp()
        });

        // Update comment count on task
        await updateDoc(doc(db, 'devTasks', selectedTask.id), {
            commentCount: (selectedTask.commentCount || 0) + 1
        });

        input.value = '';
        await loadComments(selectedTask.id);

    } catch (error) {
        console.error('Error adding comment:', error);
        alert('Failed to add comment.');
    }
}

// ===================================
// Attachments
// ===================================
async function loadAttachments(taskId) {
    const attachmentsList = document.getElementById('attachmentsList');

    const task = tasks.find(t => t.id === taskId);
    const attachments = task?.attachments || [];

    if (attachments.length === 0) {
        attachmentsList.innerHTML = '<p class="no-attachments">No attachments yet.</p>';
        return;
    }

    attachmentsList.innerHTML = attachments.map(att => `
        <div class="attachment-item">
            <div class="attachment-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
            </div>
            <div class="attachment-info">
                <a href="${att.url}" target="_blank" class="attachment-name">${escapeHtml(att.name)}</a>
            </div>
        </div>
    `).join('');
}

async function uploadAttachment(file) {
    if (!selectedTask || !file) return;

    try {
        const storageRef = ref(storage, `devportal/${selectedTask.id}/${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        const task = tasks.find(t => t.id === selectedTask.id);
        const attachments = task?.attachments || [];
        attachments.push({
            name: file.name,
            url: url,
            type: file.type,
            uploadedAt: new Date().toISOString()
        });

        await updateDoc(doc(db, 'devTasks', selectedTask.id), {
            attachments: attachments
        });

        await loadAttachments(selectedTask.id);

    } catch (error) {
        console.error('Error uploading attachment:', error);
        alert('Failed to upload file.');
    }
}

// ===================================
// Task Actions
// ===================================
async function createTask(data) {
    try {
        const taskData = {
            title: data.title,
            description: data.description || '',
            status: 'todo',
            priority: data.priority || 'medium',
            createdBy: {
                id: currentUser.id,
                username: currentUser.displayName || currentUser.username,
                avatar: currentUser.avatar
            },
            assignedTo: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            commentCount: 0,
            attachments: []
        };

        if (data.assigneeId) {
            const assignee = teamMembers.find(m => m.id === data.assigneeId);
            if (assignee) {
                taskData.assignedTo = {
                    id: assignee.id,
                    username: assignee.username,
                    avatar: assignee.avatar
                };
            }
        }

        await addDoc(collection(db, 'devTasks'), taskData);
        return true;

    } catch (error) {
        console.error('Error creating task:', error);
        return false;
    }
}

async function submitForReview() {
    if (!selectedTask) return;

    try {
        await updateDoc(doc(db, 'devTasks', selectedTask.id), {
            status: 'review',
            submittedForReview: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        closeTaskDetail();
    } catch (error) {
        console.error('Error submitting for review:', error);
        alert('Failed to submit for review.');
    }
}

async function approveTask() {
    if (!selectedTask || !canApprove) return;

    try {
        await updateDoc(doc(db, 'devTasks', selectedTask.id), {
            status: 'completed',
            reviewedBy: {
                id: currentUser.id,
                username: currentUser.displayName || currentUser.username
            },
            reviewedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        closeTaskDetail();
    } catch (error) {
        console.error('Error approving task:', error);
        alert('Failed to approve task.');
    }
}

async function requestChanges(notes) {
    if (!selectedTask || !canApprove) return;

    try {
        await updateDoc(doc(db, 'devTasks', selectedTask.id), {
            status: 'in_progress',
            reviewNotes: notes,
            reviewedBy: {
                id: currentUser.id,
                username: currentUser.displayName || currentUser.username
            },
            reviewedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        closeTaskDetail();
    } catch (error) {
        console.error('Error requesting changes:', error);
        alert('Failed to request changes.');
    }
}

async function changeAssignee(taskId, assigneeId) {
    try {
        let assignedTo = null;
        if (assigneeId) {
            const assignee = teamMembers.find(m => m.id === assigneeId);
            if (assignee) {
                assignedTo = {
                    id: assignee.id,
                    username: assignee.username,
                    avatar: assignee.avatar
                };
            }
        }

        await updateDoc(doc(db, 'devTasks', taskId), {
            assignedTo: assignedTo,
            updatedAt: serverTimestamp()
        });

    } catch (error) {
        console.error('Error changing assignee:', error);
        alert('Failed to change assignee.');
    }
}

async function changePriority(taskId, priority) {
    try {
        await updateDoc(doc(db, 'devTasks', taskId), {
            priority: priority,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error('Error changing priority:', error);
        alert('Failed to change priority.');
    }
}

// ===================================
// Event Listeners
// ===================================
function setupEventListeners() {
    // Add Task Modal
    document.getElementById('addTaskBtn').addEventListener('click', () => {
        document.getElementById('addTaskModal').hidden = false;
    });

    document.getElementById('closeAddModal').addEventListener('click', () => {
        document.getElementById('addTaskModal').hidden = true;
    });

    document.getElementById('cancelAddTask').addEventListener('click', () => {
        document.getElementById('addTaskModal').hidden = true;
    });

    document.querySelector('#addTaskModal .modal-backdrop').addEventListener('click', () => {
        document.getElementById('addTaskModal').hidden = true;
    });

    document.getElementById('addTaskForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const success = await createTask({
            title: document.getElementById('taskTitle').value,
            description: document.getElementById('taskDescription').value,
            priority: document.getElementById('taskPriority').value,
            assigneeId: document.getElementById('taskAssignee').value
        });

        if (success) {
            document.getElementById('addTaskModal').hidden = true;
            document.getElementById('addTaskForm').reset();
        } else {
            alert('Failed to create task.');
        }
    });

    // Task Slideout
    document.getElementById('closeSlideout').addEventListener('click', closeTaskDetail);
    document.querySelector('#taskSlideout .slideout-backdrop').addEventListener('click', closeTaskDetail);

    // Task Actions
    document.getElementById('submitReviewBtn').addEventListener('click', submitForReview);
    document.getElementById('approveBtn').addEventListener('click', approveTask);
    document.getElementById('requestChangesBtn').addEventListener('click', () => {
        document.getElementById('requestChangesModal').hidden = false;
    });

    // Request Changes Modal
    document.getElementById('closeChangesModal').addEventListener('click', () => {
        document.getElementById('requestChangesModal').hidden = true;
    });

    document.getElementById('cancelChanges').addEventListener('click', () => {
        document.getElementById('requestChangesModal').hidden = true;
    });

    document.getElementById('requestChangesForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const notes = document.getElementById('changesNotes').value;
        await requestChanges(notes);
        document.getElementById('requestChangesModal').hidden = true;
        document.getElementById('changesNotes').value = '';
    });

    // Change Assignee
    document.getElementById('changeAssignee').addEventListener('change', async (e) => {
        if (selectedTask && e.target.value !== '') {
            await changeAssignee(selectedTask.id, e.target.value || null);
            e.target.value = '';
            openTaskDetail(selectedTask.id);
        }
    });

    // Change Priority
    document.getElementById('changePriority').addEventListener('change', async (e) => {
        if (selectedTask && e.target.value) {
            await changePriority(selectedTask.id, e.target.value);
            e.target.value = '';
            openTaskDetail(selectedTask.id);
        }
    });

    // Comments
    document.getElementById('addCommentBtn').addEventListener('click', addComment);
    document.getElementById('commentInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addComment();
        }
    });

    // Attachments
    document.getElementById('uploadAttachmentBtn').addEventListener('click', () => {
        document.getElementById('attachmentInput').click();
    });

    document.getElementById('attachmentInput').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadAttachment(e.target.files[0]);
        }
    });

    // Filters
    document.getElementById('filterAssignee').addEventListener('change', renderKanbanBoard);
    document.getElementById('filterPriority').addEventListener('change', renderKanbanBoard);
}

// ===================================
// Custom Dropdown Component
// ===================================
function createCustomDropdown(selectElement) {
    // Skip if already converted
    if (selectElement.dataset.customized) return;
    selectElement.dataset.customized = 'true';

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-dropdown';

    // Create trigger button
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-dropdown-trigger';

    const selectedOption = selectElement.options[selectElement.selectedIndex];
    trigger.innerHTML = `
        <span class="custom-dropdown-text">${selectedOption ? selectedOption.textContent : 'Select...'}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    `;

    // Create menu
    const menu = document.createElement('div');
    menu.className = 'custom-dropdown-menu';

    // Populate options
    Array.from(selectElement.options).forEach((option, index) => {
        const optionEl = document.createElement('div');
        optionEl.className = 'custom-dropdown-option';
        if (index === selectElement.selectedIndex) {
            optionEl.classList.add('selected');
        }
        optionEl.dataset.value = option.value;
        optionEl.textContent = option.textContent;

        optionEl.addEventListener('click', (e) => {
            e.stopPropagation();

            // Update select value
            selectElement.value = option.value;

            // Update trigger text
            trigger.querySelector('.custom-dropdown-text').textContent = option.textContent;

            // Update selected state
            menu.querySelectorAll('.custom-dropdown-option').forEach(opt => opt.classList.remove('selected'));
            optionEl.classList.add('selected');

            // Close dropdown
            wrapper.classList.remove('open');

            // Dispatch change event
            selectElement.dispatchEvent(new Event('change', { bubbles: true }));
        });

        menu.appendChild(optionEl);
    });

    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();

        // Close other dropdowns
        document.querySelectorAll('.custom-dropdown.open').forEach(dd => {
            if (dd !== wrapper) dd.classList.remove('open');
        });

        wrapper.classList.toggle('open');
    });

    // Hide original select
    selectElement.style.display = 'none';

    // Insert custom dropdown
    selectElement.parentNode.insertBefore(wrapper, selectElement);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    wrapper.appendChild(selectElement);

    return wrapper;
}

function updateCustomDropdownOptions(selectElement) {
    const wrapper = selectElement.closest('.custom-dropdown');
    if (!wrapper) return;

    const menu = wrapper.querySelector('.custom-dropdown-menu');
    const trigger = wrapper.querySelector('.custom-dropdown-trigger');

    // Clear existing options
    menu.innerHTML = '';

    // Repopulate
    Array.from(selectElement.options).forEach((option, index) => {
        const optionEl = document.createElement('div');
        optionEl.className = 'custom-dropdown-option';
        if (index === selectElement.selectedIndex) {
            optionEl.classList.add('selected');
        }
        optionEl.dataset.value = option.value;
        optionEl.textContent = option.textContent;

        optionEl.addEventListener('click', (e) => {
            e.stopPropagation();
            selectElement.value = option.value;
            trigger.querySelector('.custom-dropdown-text').textContent = option.textContent;
            menu.querySelectorAll('.custom-dropdown-option').forEach(opt => opt.classList.remove('selected'));
            optionEl.classList.add('selected');
            wrapper.classList.remove('open');
            selectElement.dispatchEvent(new Event('change', { bubbles: true }));
        });

        menu.appendChild(optionEl);
    });

    // Update trigger text
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    if (selectedOption) {
        trigger.querySelector('.custom-dropdown-text').textContent = selectedOption.textContent;
    }
}

// Close dropdowns when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.custom-dropdown.open').forEach(dd => {
        dd.classList.remove('open');
    });
});

// Initialize custom dropdowns for all selects
function initCustomDropdowns() {
    const selects = document.querySelectorAll('.filter-select, .form-group select, .action-select');
    selects.forEach(select => createCustomDropdown(select));
}

// ===================================
// Utilities
// ===================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

console.log('Dev Portal initialized');

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://otqxzgbjumsasmfdotia.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90cXh6Z2JqdW1zYXNtZmRvdGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MTkyNzgsImV4cCI6MjA5MTk5NTI3OH0.KYVnaM3rqGxCj2sduiIoEhCuedwuYn9HZUvgqD0VNL4';
const ADMIN_PASSWORD = 'jharold'; // Change this!

const BUCKET_NAME = 'project-files'; // Ensure this bucket exists in Supabase Storage
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let allData = [];
let currentYear = null;
let isAdmin = false;
let searchQuery = '';
let sortCol = 'title';
let sortDir = 'asc';

const STATUS_OPTIONS = ['In Progress', 'Completed', 'Archived'];
let activeModalProjectId = null;

// --- INITIALIZATION ---
async function init() {
    await fetchData();
    // Debugging check: Verify if the 'status' column exists in returned data
    if (allData.length > 0 && !allData[0].hasOwnProperty('status')) {
        console.error("Schema Mismatch: The 'status' column is missing from your Supabase table.");
    }
}

async function fetchData() {
    document.getElementById('table-body').innerHTML = '<tr><td colspan="5" class="loading-text">Fetching projects...</td></tr>';
    const { data, error } = await supabaseClient
        .from('projects')
        .select('*')
        .order('year', { ascending: false });

    if (error) {
        console.error('Fetch error:', error);
        const label = document.getElementById('current-year-label');
        if (label) label.innerText = "Error loading data.";
    } else {
        allData = data;
        const years = [...new Set(allData.map(item => item.year))];
        renderYearButtons(years);
        if (!currentYear && years.length > 0) currentYear = years[0];
        renderTable();
    }
}

// --- RENDERING ---
function renderYearButtons(years) {
    const container = document.getElementById('year-buttons');
    if (!container) return;
    container.innerHTML = years.map(y => `
        <button class="${y === currentYear ? 'active' : ''}" onclick="switchYear('${y}')">${y}</button>
    `).join('');
}

// Helper to handle legacy single strings, simple arrays, and new name/url objects
function parseFiles(fileData) {
    if (!fileData || fileData === '#' || fileData === '[]') return [];
    try {
        const parsed = JSON.parse(fileData);
        const array = Array.isArray(parsed) ? parsed : [parsed];
        // Normalize all items to { name: string, url: string }
        return array.map(item => {
            if (typeof item === 'string') {
                // Fallback: Extract filename from URL and remove the random prefix
                const name = item.split('/').pop().split('-').slice(1).join('-') || 'File';
                return { name, url: item };
            }
            return item;
        });
    } catch (e) {
        const name = fileData.split('/').pop() || 'File';
        return [{ name, url: fileData }];
    }
}

function renderTable() {
    const label = document.getElementById('current-year-label');
    if (label) label.innerText = `Year: ${currentYear || 'N/A'}`;
    
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    
    let filtered = allData.filter(item => 
        item.year == currentYear && 
        item.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    filtered.sort((a, b) => {
        let valA = (a[sortCol] || '').toString().toLowerCase();
        let valB = (b[sortCol] || '').toString().toLowerCase();
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    // Get the first available image for the thumbnail preview
    const getFirstImage = (files) => files.find(f => isImage(f.url));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 5 : 4}" class="no-results">No projects found matching your criteria.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(item => `
        <tr>
            <td class="title-cell">
                ${isAdmin ? 
                    `<input type="text" value="${item.title}" onchange="updateItem(${item.id}, 'title', this.value)">` : 
                    `<strong>${item.title}</strong>`}
                ${getFirstImage(parseFiles(item.file_link)) ? `<img src="${getFirstImage(parseFiles(item.file_link)).url}" alt="Preview" class="thumbnail-preview">` : ''}
            </td>
            <td>${isAdmin ? `<input type="text" value="${item.location}" onchange="updateItem(${item.id}, 'location', this.value)">` : item.location}</td>
            <td>
                ${isAdmin ? 
                    `<select onchange="updateItem(${item.id}, 'status', this.value)">
                        ${STATUS_OPTIONS.map(opt => `
                            <option value="${opt}" ${ (item.status || 'In Progress') === opt ? 'selected' : ''}>${opt}</option>
                        `).join('')}
                    </select>` : 
                    `<span class="status-badge ${getStatusClass(item.status)}">${item.status || 'In Progress'}</span>`
                }
            </td>
            <td>
                ${(parseFiles(item.file_link).length > 0 || isAdmin) ? 
                    `<button class="btn-view-files" onclick="openFileModal(${item.id})">
                        ${parseFiles(item.file_link).length > 0 ? `View Files (${parseFiles(item.file_link).length})` : '+ Add Files'}
                     </button>` : 
                    `<span style="color:var(--text-muted); font-size:0.875rem">No files attached</span>`
                }
            </td>
            <td class="admin-only" style="${isAdmin ? '' : 'display:none'}">
                <button class="btn-delete" onclick="deleteItem(${item.id})">Delete</button>
            </td>
        </tr>
    `).join('');

    // Toggle admin column visibility
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = isAdmin ? 'table-cell' : 'none');
}

function handleSearch(val) {
    searchQuery = val;
    renderTable();
}

function handleSort(col) {
    if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortCol = col; sortDir = 'asc'; }
    renderTable();
}

function switchYear(year) {
    currentYear = year;
    const years = [...new Set(allData.map(item => item.year))];
    renderYearButtons(years);
    renderTable();
}

function getStatusClass(status) {
    const statusMap = {
        'completed': 'status-completed',
        'archived': 'status-archived',
        'in progress': 'status-in-progress'
    };
    const s = (status || '').toLowerCase();
    return statusMap[s] || 'status-in-progress';
}

function isImage(url) {
    return url && (url.match(/\.(jpeg|jpg|gif|png)$/) != null);
}

// --- MODAL LOGIC ---
function showConfirm(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); display: flex; align-items: center;
            justify-content: center; z-index: 2000; transition: opacity 0.2s;
        `;
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: white; padding: 24px; border-radius: 12px;
            max-width: 400px; width: 90%; text-align: center;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2); font-family: inherit;
        `;
        modal.innerHTML = `
            <p style="margin-bottom: 24px; font-size: 1.1rem; color: #333;">${message}</p>
            <div style="display: flex; justify-content: center; gap: 12px;">
                <button id="conf-cancel" style="padding: 10px 20px; border: 1px solid #ddd; background: #f8f9fa; border-radius: 6px; cursor: pointer; font-weight: 500;">Cancel</button>
                <button id="conf-ok" style="padding: 10px 20px; border: none; background: #e74c3c; color: white; border-radius: 6px; cursor: pointer; font-weight: 500;">Delete</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        const done = (res) => { document.body.removeChild(overlay); resolve(res); };
        document.getElementById('conf-cancel').onclick = () => done(false);
        document.getElementById('conf-ok').onclick = () => done(true);
    });
}

function showAddProjectModal() {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal'; 
        overlay.style.display = 'flex';
        
        const modal = document.createElement('div');
        modal.className = 'modal-content';
        modal.style.maxWidth = '450px';

        modal.innerHTML = `
            <div class="modal-header">
                <h3>Create New Project</h3>
                <button class="close-modal" id="add-proj-close">&times;</button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 20px;">
                <div>
                    <label style="display:block; margin-bottom:6px; font-weight:600; font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Project Title</label>
                    <input type="text" id="add-proj-title" placeholder="e.g. Modern Residential Complex" required>
                </div>
                <div>
                    <label style="display:block; margin-bottom:6px; font-weight:600; font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Location</label>
                    <input type="text" id="add-proj-location" placeholder="e.g. Austin, TX" required>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                    <div>
                        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Year</label>
                        <input type="number" id="add-proj-year" value="${new Date().getFullYear()}" required>
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Initial Status</label>
                        <select id="add-proj-status">
                            ${STATUS_OPTIONS.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 10px; padding-top: 20px; border-top: 1px solid var(--border);">
                    <button id="add-proj-cancel" style="padding: 10px 18px; color: var(--text-muted);">Cancel</button>
                    <button id="add-proj-confirm" style="padding: 10px 18px; background:var(--primary); color:white; border-radius: 8px;">Create Project</button>
                </div>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        const done = (res) => { document.body.removeChild(overlay); resolve(res); };
        document.getElementById('add-proj-close').onclick = () => done(null);
        document.getElementById('add-proj-cancel').onclick = () => done(null);
        document.getElementById('add-proj-confirm').onclick = () => {
            const data = { title: document.getElementById('add-proj-title').value.trim(), location: document.getElementById('add-proj-location').value.trim(), year: parseInt(document.getElementById('add-proj-year').value), status: document.getElementById('add-proj-status').value };
            if (!data.title || !data.location || isNaN(data.year)) return alert("Please fill in all fields.");
            done(data);
        };
    });
}

function openFileModal(projectId) {
    activeModalProjectId = projectId;
    const project = allData.find(p => p.id === projectId);
    if (!project) return;

    document.getElementById('modal-project-title').innerText = project.title;
    document.getElementById('modal-admin-section').style.display = isAdmin ? 'block' : 'none';
    renderModalFiles();
    document.getElementById('file-modal').style.display = 'flex';
}

function renderModalFiles() {
    const project = allData.find(p => p.id === activeModalProjectId);
    const listContainer = document.getElementById('modal-file-list');
    const files = parseFiles(project ? project.file_link : '[]');

    if (files.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:0.875rem;">No files uploaded yet.</p>';
        return;
    }

    listContainer.innerHTML = files.map((file) => `
        <div class="file-item">
            <a href="${file.url}" target="_blank">${file.name}</a>
            ${isAdmin ? `<button class="btn-remove-file" onclick="removeFile(${project.id}, '${file.url}')">&times;</button>` : ''}
        </div>
    `).join('');
}

function closeModal() {
    document.getElementById('file-modal').style.display = 'none';
    activeModalProjectId = null;
    document.getElementById('modal-file-upload').value = ''; // Reset input
    renderTable(); // Sync main table
}

// --- ADMIN ACTIONS ---
function handleAuthClick() {
    if (isAdmin) { logout(); return; }
    const pass = prompt("Enter Admin Password:");
    if (pass === ADMIN_PASSWORD) {
        isAdmin = true;
        document.getElementById('admin-panel').style.display = 'block';
        document.getElementById('auth-btn').innerText = "Exit Admin";
        renderTable();
    } else if (pass !== null) {
        alert("Wrong password.");
    }
}

function logout() {
    isAdmin = false;
    document.getElementById('admin-panel').style.display = 'none';
    document.getElementById('auth-btn').innerText = "Admin Login";
    renderTable();
}

async function updateItem(id, field, value) {
    const { error } = await supabaseClient.from('projects').update({ [field]: value }).eq('id', id);
    if (error) {
        alert("Save failed: " + error.message);
    } else {
        const item = allData.find(i => i.id === id);
        if (item) item[field] = value;
    }
}

async function handleModalUpload(event) {
    const file = event.target.files[0];
    const id = activeModalProjectId;
    if (!file) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${id}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${fileName}`;
    const originalName = file.name;
    
    const item = allData.find(i => i.id === id);
    const currentFiles = parseFiles(item ? item.file_link : null);

    // 1. Upload file to Supabase Storage
    const { error: uploadError } = await supabaseClient.storage
        .from(BUCKET_NAME)
        .upload(filePath, file);

    if (uploadError) {
        alert("Upload failed: " + uploadError.message);
        return;
    }

    // 2. Get Public URL
    const { data: { publicUrl } } = supabaseClient.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

    // 3. Update the table with the appended list
    currentFiles.push({ name: originalName, url: publicUrl });
    await updateItem(id, 'file_link', JSON.stringify(currentFiles));
    
    // Refresh both UI layers
    renderModalFiles();
}

async function removeFile(projectId, fileUrl) {
    const confirmed = await showConfirm("Are you sure you want to remove this specific file?");
    if (!confirmed) return;

    const item = allData.find(i => i.id === projectId);
    if (!item) return;

    const currentFiles = parseFiles(item.file_link);
    const updatedFiles = currentFiles.filter(file => file.url !== fileUrl);

    // 1. Update Database
    await updateItem(projectId, 'file_link', JSON.stringify(updatedFiles));

    // 2. Attempt to delete from Storage (extract path from URL)
    const urlParts = fileUrl.split(`${BUCKET_NAME}/`);
    if (urlParts.length > 1) {
        // Strip query parameters and decode URI components (e.g. %20 -> space)
        const filePath = decodeURIComponent(urlParts[1].split('?')[0]);
        const { error: storageError } = await supabaseClient.storage.from(BUCKET_NAME).remove([filePath]);
        if (storageError) alert("Storage deletion failed: " + storageError.message);
    }

    renderModalFiles();
}

async function deleteItem(id) {
    const confirmed = await showConfirm("Are you sure you want to delete this project?");
    if (!confirmed) return;

    // 1. Find the project and all associated files
    const project = allData.find(p => p.id === id);
    if (project) {
        const files = parseFiles(project.file_link);
        const pathsToDelete = files.map(file => {
            const parts = file.url.split(`${BUCKET_NAME}/`);
            // Ensure we get the clean, decoded file path
            return parts.length > 1 ? decodeURIComponent(parts[1].split('?')[0]) : null;
        }).filter(p => p !== null);

        // 2. Delete all associated files from Storage
        if (pathsToDelete.length > 0) {
            const { error: storageError } = await supabaseClient.storage.from(BUCKET_NAME).remove(pathsToDelete);
            if (storageError) console.warn("Error purging storage files:", storageError);
        }
    }

    // 3. Delete the database row
    const { error } = await supabaseClient.from('projects').delete().eq('id', id);
    if (error) alert("Delete failed");
    else await fetchData();
}

async function addNewProject() {
    const projectData = await showAddProjectModal();
    if (!projectData) return;

    const confirmed = await showConfirm(`Confirm creating project "${projectData.title}" for ${projectData.year}?`);
    if (!confirmed) return;

    const newProject = { ...projectData, file_link: '[]' };
    const { error } = await supabaseClient.from('projects').insert([newProject]);
    
    if (error) return alert(`Insert failed: ${error.message}`);
    currentYear = projectData.year;
    await fetchData();
}

init();
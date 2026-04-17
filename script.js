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

// Helper to handle legacy single strings and new JSON arrays
function parseFiles(fileData) {
    if (!fileData || fileData === '#') return [];
    try {
        const parsed = JSON.parse(fileData);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
        // Fallback for plain string URLs
        return [fileData];
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
    const getFirstImage = (links) => links.find(url => isImage(url));

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
                ${getFirstImage(parseFiles(item.file_link)) ? `<img src="${getFirstImage(parseFiles(item.file_link))}" alt="Preview" class="thumbnail-preview">` : ''}
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
                ${parseFiles(item.file_link).length > 0 ? 
                    `<button class="btn-view-files" onclick="openFileModal(${item.id})">
                        View Files (${parseFiles(item.file_link).length})
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

    listContainer.innerHTML = files.map((url, idx) => `
        <div class="file-item">
            <a href="${url}" target="_blank">Attachment ${idx + 1}</a>
            ${isAdmin ? `<button class="btn-remove-file" onclick="removeFile(${project.id}, '${url}')">&times;</button>` : ''}
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
    currentFiles.push(publicUrl);
    await updateItem(id, 'file_link', JSON.stringify(currentFiles));
    
    // Refresh both UI layers
    renderModalFiles();
}

async function removeFile(projectId, fileUrl) {
    if (!confirm("Are you sure you want to remove this specific file?")) return;

    const item = allData.find(i => i.id === projectId);
    if (!item) return;

    const currentFiles = parseFiles(item.file_link);
    const updatedFiles = currentFiles.filter(url => url !== fileUrl);

    // 1. Update Database
    await updateItem(projectId, 'file_link', JSON.stringify(updatedFiles));

    // 2. Attempt to delete from Storage (extract path from URL)
    try {
        const urlParts = fileUrl.split(`${BUCKET_NAME}/`);
        if (urlParts.length > 1) {
            const filePath = urlParts[1];
            await supabaseClient.storage.from(BUCKET_NAME).remove([filePath]);
        }
    } catch (e) {
        console.warn("Could not delete file from storage:", e);
    }

    renderModalFiles();
}

async function deleteItem(id) {
    if (!confirm("Are you sure you want to delete this project?")) return;
    const { error } = await supabaseClient.from('projects').delete().eq('id', id);
    if (error) alert("Delete failed");
    else await fetchData();
}

async function addNewProject() {
    const yearInput = prompt("Enter Year for new project:", currentYear || 2026);
    if (!yearInput) return;
    const year = parseInt(yearInput);
    if (isNaN(year)) {
        alert("Please enter a valid number for the year.");
        return;
    }
    const newProject = { year: year, title: 'New Title', location: 'Location', file_link: '[]', status: 'In Progress' };
    const { error } = await supabaseClient.from('projects').insert([newProject]);
    if (error) {
        alert(`Insert failed: ${error.message}`);
        return;
    }
    currentYear = year;
    await fetchData();
}

init();
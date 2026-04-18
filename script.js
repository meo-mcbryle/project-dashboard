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
let searchTimeout;
let newProjectPendingFiles = []; // For storing files before project exists

const STATUS_OPTIONS = ['In Progress', 'Completed', 'Archived'];
let activeModalProjectId = null;

// --- INITIALIZATION ---
async function init() {
    await fetchData();
    initDropZone();
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
    
    // Update Sort Headers UI
    document.querySelectorAll('.sortable').forEach(th => {
        th.classList.remove('active-sort');
        th.querySelector('.sort-icon').innerText = '↕';
    });
    const activeTh = document.getElementById(`th-${sortCol}`);
    if (activeTh) {
        activeTh.classList.add('active-sort');
        activeTh.querySelector('.sort-icon').innerText = sortDir === 'asc' ? '↑' : '↓';
    }

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

    tbody.innerHTML = filtered.map(item => {
        // Pre-parse files once per row to optimize performance
        const files = parseFiles(item.file_link);
        const fileCount = files.length;
        const previewImg = getFirstImage(files);

        return `
        <tr>
            <td class="title-cell col-title" data-label="Project" title="${item.title}">
                <strong>${item.title}</strong>
                ${previewImg ? `<img src="${previewImg.url}" alt="Preview" class="thumbnail-preview">` : ''}
            </td>
            <td class="col-location" data-label="Location" title="${item.location}">
                <span class="location-text">${item.location}</span>
            </td>
            <td class="col-status" data-label="Status">
                <span class="status-badge ${getStatusClass(item.status)}">${item.status || 'In Progress'}</span>
            </td>
            <td class="col-files" data-label="Files">
                ${(fileCount > 0 || isAdmin) ? 
                    `<button class="btn-view-files" onclick="openFileModal(${item.id})">
                        ${fileCount > 0 ? `View Files (${fileCount})` : '+ Add Files'}
                     </button>` : 
                    `<span style="color:var(--text-muted); font-size:0.875rem">No files attached</span>`
                }
            </td>
            <td class="admin-only col-admin" data-label="Actions" style="${isAdmin ? '' : 'display:none'}">
                <div class="action-wrapper">
                    <button class="btn-action edit" onclick="openEditModal(${item.id})" data-tooltip="Edit" aria-label="Edit Project">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <div class="action-divider"></div>
                    <button class="btn-action delete" onclick="deleteItem(${item.id})" data-tooltip="Delete" aria-label="Delete Project">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>
            </td>
        </tr>
    `;}).join('');

    // Toggle admin column visibility
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = isAdmin ? '' : 'none');
}

function handleSearch(val) {
    searchQuery = val;
    clearTimeout(searchTimeout);
    // Debounce re-render to 250ms to keep input responsive
    searchTimeout = setTimeout(renderTable, 250);
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
function showConfirm(message, okText = 'Delete', okColor = '#e74c3c') {
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
                <button id="conf-ok" style="padding: 10px 20px; border: none; background: ${okColor}; color: white; border-radius: 6px; cursor: pointer; font-weight: 500;">${okText}</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        const done = (res) => { document.body.removeChild(overlay); resolve(res); };
        document.getElementById('conf-cancel').onclick = () => done(false);
        document.getElementById('conf-ok').onclick = () => done(true);
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
    const isNew = activeModalProjectId === 'NEW';
    const project = isNew ? null : allData.find(p => p.id === activeModalProjectId);
    const containers = [document.getElementById('modal-file-list'), document.getElementById('edit-file-list'), document.getElementById('add-file-list')];
    const files = isNew ? newProjectPendingFiles : parseFiles(project ? project.file_link : '[]');

    const html = files.length === 0 
        ? '<p style="text-align:center; color:var(--text-muted); font-size:0.875rem;">No files uploaded yet.</p>'
        : files.map((file) => {
        const isExternal = !file.url.includes(SUPABASE_URL);
        return `
            <div class="file-item">
                ${isExternal ? `<span class="link-badge">Link</span>` : ''}
                <a href="${file.url}" target="_blank">${file.name}</a>
                ${isAdmin ? `<button class="btn-remove-file" onclick="removeFile(${isNew ? "'NEW'" : project.id}, '${file.url}')">&times;</button>` : ''}
            </div>
        `;
    }).join('');

    containers.forEach(c => { if(c) c.innerHTML = html; });
}

function closeModal() {
    document.getElementById('file-modal').style.display = 'none';
    activeModalProjectId = null;
    document.getElementById('modal-file-upload').value = ''; // Reset input
    document.getElementById('modal-url-upload').value = ''; // Reset input
    renderTable(); // Sync main table
}

function openEditModal(projectId) {
    activeModalProjectId = projectId;
    const project = allData.find(p => p.id === projectId);
    if (!project) return;

    document.getElementById('edit-proj-title').value = project.title || '';
    document.getElementById('edit-proj-location').value = project.location || '';
    document.getElementById('edit-proj-year').value = project.year || new Date().getFullYear();
    
    const statusSelect = document.getElementById('edit-proj-status');
    statusSelect.innerHTML = STATUS_OPTIONS.map(opt => `
        <option value="${opt}" ${ (project.status || 'In Progress') === opt ? 'selected' : ''}>${opt}</option>
    `).join('');

    renderModalFiles();
    document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
    activeModalProjectId = null;
    document.getElementById('edit-file-upload').value = '';
    document.getElementById('edit-url-upload').value = '';
    renderTable();
}

function getActiveFileElements() {
    const isEditModal = document.getElementById('edit-modal').style.display === 'flex';
    const isAddModal = document.getElementById('create-modal').style.display === 'flex';
    if (isAddModal) {
        return {
            list: document.getElementById('add-file-list'),
            urlInput: document.getElementById('add-url-upload'),
            fileInput: document.getElementById('add-file-upload')
        };
    }
    return {
        list: document.getElementById(isEditModal ? 'edit-file-list' : 'modal-file-list'),
        urlInput: document.getElementById(isEditModal ? 'edit-url-upload' : 'modal-url-upload'),
        fileInput: document.getElementById(isEditModal ? 'edit-file-upload' : 'modal-file-upload')
    };
}

async function addNewProject() {
    activeModalProjectId = 'NEW';
    newProjectPendingFiles = [];
    
    document.getElementById('add-proj-title').value = '';
    document.getElementById('add-proj-location').value = '';
    document.getElementById('add-proj-year').value = new Date().getFullYear();
    
    const statusSelect = document.getElementById('add-proj-status');
    statusSelect.innerHTML = STATUS_OPTIONS.map(opt => `<option value="${opt}">${opt}</option>`).join('');

    renderModalFiles();
    document.getElementById('create-modal').style.display = 'flex';
}

function closeAddModal() {
    document.getElementById('create-modal').style.display = 'none';
    activeModalProjectId = null;
    newProjectPendingFiles = [];
}

async function handleCreateSave() {
    const title = document.getElementById('add-proj-title').value.trim();
    const location = document.getElementById('add-proj-location').value.trim();
    const year = parseInt(document.getElementById('add-proj-year').value);
    const status = document.getElementById('add-proj-status').value;

    if (!title || !location || isNaN(year)) return alert("Please fill in all required fields.");

    const confirmed = await showConfirm(`Create project "${title}"?`, "Confirm", "#2563eb");
    if (!confirmed) return;

    // 1. Insert Initial Project
    const { data, error } = await supabaseClient.from('projects').insert([{ title, location, year, status, file_link: '[]' }]).select();
    if (error) return alert("Creation failed: " + error.message);
    
    const newId = data[0].id;
    const finalFiles = [];

    // 2. Process pending files (Upload physical files, pass through links)
    for (const item of newProjectPendingFiles) {
        if (item.file) {
            const fileExt = item.file.name.split('.').pop();
            const fileName = `${newId}-${Math.random().toString(36).substring(2)}.${fileExt}`;
            const { error: uploadError } = await supabaseClient.storage.from(BUCKET_NAME).upload(fileName, item.file);
            
            if (!uploadError) {
                const { data: { publicUrl } } = supabaseClient.storage.from(BUCKET_NAME).getPublicUrl(fileName);
                finalFiles.push({ name: item.name, url: publicUrl });
            }
        } else {
            finalFiles.push(item);
        }
    }

    // 3. Update with final file list
    if (finalFiles.length > 0) {
        await supabaseClient.from('projects').update({ file_link: JSON.stringify(finalFiles) }).eq('id', newId);
    }

    currentYear = year;
    closeAddModal();
    await fetchData();
}

async function handleEditSave() {
    const id = activeModalProjectId;
    const updates = {
        title: document.getElementById('edit-proj-title').value.trim(),
        location: document.getElementById('edit-proj-location').value.trim(),
        year: parseInt(document.getElementById('edit-proj-year').value),
        status: document.getElementById('edit-proj-status').value
    };

    const { error } = await supabaseClient.from('projects').update(updates).eq('id', id);
    if (error) return alert("Save failed: " + error.message);

    const itemIndex = allData.findIndex(i => i.id === id);
    if (itemIndex !== -1) allData[itemIndex] = { ...allData[itemIndex], ...updates };
    
    closeEditModal();
    renderTable();
}

// --- ADMIN ACTIONS ---
function handleAuthClick() {
    if (isAdmin) { logout(); return; }
    document.getElementById('admin-password-input').value = '';
    document.getElementById('login-modal').style.display = 'flex';
    document.getElementById('admin-password-input').focus();
}

function closeLoginModal() {
    document.getElementById('login-modal').style.display = 'none';
}

function handleLoginSubmit() {
    const pass = document.getElementById('admin-password-input').value;
    if (pass === ADMIN_PASSWORD) {
        isAdmin = true;
        document.getElementById('admin-panel').style.display = 'block';
        document.getElementById('auth-btn').innerText = "Exit Admin";
        renderTable();
        closeLoginModal();
    } else {
        const modalContent = document.querySelector('#login-modal .modal-content');
        modalContent.classList.add('shake');
        
        // Remove the class after the animation ends so it can be re-triggered
        setTimeout(() => {
            modalContent.classList.remove('shake');
            showErrorModal("The password you entered is incorrect. Please try again or contact the administrator.");
        }, 400);
    }
}

function showErrorModal(message) {

    if (message) {
        document.getElementById('error-modal-message').innerText = message;
    }
    document.getElementById('error-modal').style.display = 'flex';
}

function closeErrorModal() {
    document.getElementById('error-modal').style.display = 'none';
    document.getElementById('admin-password-input').value = '';
    document.getElementById('admin-password-input').focus();
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

function initDropZone() {
    const zones = [document.getElementById('drop-zone'), document.getElementById('edit-drop-zone'), document.getElementById('add-drop-zone')];
    
    zones.forEach(dz => {
        if (!dz) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(name => {
            dz.addEventListener(name, e => { e.preventDefault(); e.stopPropagation(); }, false);
        });

        ['dragenter', 'dragover'].forEach(name => {
            dz.addEventListener(name, () => dz.classList.add('drop-zone--over'), false);
        });

        ['dragleave', 'drop'].forEach(name => {
            dz.addEventListener(name, () => dz.classList.remove('drop-zone--over'), false);
        });

        dz.addEventListener('drop', e => {
            const files = Array.from(e.dataTransfer.files);
            if (files.length) uploadFiles(files);
        }, false);
    });
}

async function handleModalUpload(event) {
    await uploadFiles(Array.from(event.target.files));
    event.target.value = ''; // Reset input
}

async function uploadFiles(files) {
    const id = activeModalProjectId;
    if (!id || files.length === 0) return;

    // Special handling for New Project: Don't upload yet, just queue
    if (id === 'NEW') {
        files.forEach(file => {
            // Create a preview URL for internal use in the modal
            const tempUrl = URL.createObjectURL(file);
            newProjectPendingFiles.push({ name: file.name, url: tempUrl, file: file });
        });
        renderModalFiles();
        return;
    }
    
    const { list: listContainer } = getActiveFileElements();
    const item = allData.find(i => i.id === id);
    const currentFiles = parseFiles(item ? item.file_link : null);

    // Clear "No files" message if present
    if (listContainer.innerText.includes('No files uploaded yet')) {
        listContainer.innerHTML = '';
    }

    const uploadPromises = files.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${id}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${fileName}`;
        const originalName = file.name;

        // Create individual progress UI
        const uploadEl = document.createElement('div');
        uploadEl.className = 'file-item uploading-item';
        uploadEl.innerHTML = `
            <div class="upload-info">
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80%">${originalName}</span>
                <span class="progress-percent">0%</span>
            </div>
            <div class="progress-bg"><div class="progress-fill"></div></div>
        `;
        listContainer.appendChild(uploadEl);

        // 1. Upload file with progress tracking
        const { error: uploadError } = await supabaseClient.storage
            .from(BUCKET_NAME)
            .upload(filePath, file, {
                onUploadProgress: (progress) => {
                    const percent = Math.round((progress.loaded / progress.total) * 100);
                    uploadEl.querySelector('.progress-fill').style.width = `${percent}%`;
                    uploadEl.querySelector('.progress-percent').innerText = `${percent}%`;
                }
            });

        if (uploadError) {
            console.error(`Upload failed for ${originalName}:`, uploadError.message);
            uploadEl.style.borderColor = 'var(--danger)';
            uploadEl.querySelector('.progress-fill').style.background = 'var(--danger)';
            uploadEl.querySelector('.upload-info').innerHTML = `<span>Error: ${originalName}</span>`;
            setTimeout(() => uploadEl.remove(), 3000);
            return;
        }

        const { data: { publicUrl } } = supabaseClient.storage.from(BUCKET_NAME).getPublicUrl(filePath);
        currentFiles.push({ name: originalName, url: publicUrl });
        uploadEl.remove(); // Remove progress UI when done
    });

    await Promise.all(uploadPromises);

    await updateItem(id, 'file_link', JSON.stringify(currentFiles));
    renderModalFiles();
}

async function handleAddUrl() {
    const { urlInput } = getActiveFileElements();
    const url = urlInput.value.trim();
    const id = activeModalProjectId;
    
    if (!url) return;

    if (id === 'NEW') {
        newProjectPendingFiles.push({ name: url.split('/').pop() || "Link", url: url });
        urlInput.value = '';
        renderModalFiles();
        return;
    }
    
    try {
        new URL(url);
    } catch (e) {
        alert("Please enter a valid URL.");
        return;
    }

    const item = allData.find(i => i.id === id);
    const currentFiles = parseFiles(item ? item.file_link : null);

    // Extract a name from the URL path if possible
    let name = "External Link";
    const filename = url.split('/').pop().split('?')[0];
    if (filename && filename.includes('.')) name = decodeURIComponent(filename);

    currentFiles.push({ name, url });
    await updateItem(id, 'file_link', JSON.stringify(currentFiles));
    
    urlInput.value = '';
    renderModalFiles();
}

async function removeFile(projectId, fileUrl) {
    const confirmed = await showConfirm("Are you sure you want to remove this specific file?", "Remove", "#e74c3c");
    if (!confirmed) return;

    const item = allData.find(i => i.id === projectId);
    
    if (projectId === 'NEW') {
        newProjectPendingFiles = newProjectPendingFiles.filter(f => f.url !== fileUrl);
        renderModalFiles();
        return;
    }

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
    const confirmed = await showConfirm("Are you sure you want to delete this project?", "Delete", "#e74c3c");
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

init();
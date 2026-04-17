// --- CONFIGURATION ---
const SUPABASE_URL = 'https://otqxzgbjumsasmfdotia.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90cXh6Z2JqdW1zYXNtZmRvdGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MTkyNzgsImV4cCI6MjA5MTk5NTI3OH0.KYVnaM3rqGxCj2sduiIoEhCuedwuYn9HZUvgqD0VNL4';
const ADMIN_PASSWORD = 'jharold'; // Change this!

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let allData = [];
let currentYear = null;
let isAdmin = false;
let searchQuery = '';
let sortCol = 'title';
let sortDir = 'asc';

// --- INITIALIZATION ---
async function init() {
    await fetchData();
    // Debugging check: Verify if the 'status' column exists in returned data
    if (allData.length > 0 && !allData[0].hasOwnProperty('status')) {
        console.error("Schema Mismatch: The 'status' column is missing from your Supabase table.");
    }
}

async function fetchData() {
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

    tbody.innerHTML = filtered.map(item => `
        <tr>
            <td class="title-cell">
                ${isAdmin ? `<input type="text" value="${item.title}" onchange="updateItem(${item.id}, 'title', this.value)">` : item.title}
                ${isImage(item.file_link) ? `<img src="${item.file_link}" class="thumbnail-preview">` : ''}
            </td>
            <td>${isAdmin ? `<input type="text" value="${item.location}" onchange="updateItem(${item.id}, 'location', this.value)">` : item.location}</td>
            <td>
                ${isAdmin ? 
                    `<input type="text" value="${item.status || 'In Progress'}" onchange="updateItem(${item.id}, 'status', this.value)">` : 
                    `<span class="status-badge ${getStatusClass(item.status)}">${item.status || 'In Progress'}</span>`
                }
            </td>
            <td>
                ${isAdmin ? 
                    `<input type="text" value="${item.file_link}" onchange="updateItem(${item.id}, 'file_link', this.value)">` : 
                    `<a href="${item.file_link}" target="_blank">View File</a>`}
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
    const newProject = { year: year, title: 'New Title', location: 'Location', file_link: '#', status: 'In Progress' };
    const { error } = await supabaseClient.from('projects').insert([newProject]);
    if (error) {
        alert(`Insert failed: ${error.message}`);
        return;
    }
    currentYear = year;
    await fetchData();
}

init();
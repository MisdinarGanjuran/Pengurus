/**
 * ============================================================
 *  PEMBUKUAN BENDAHARA - Frontend Logic
 * ============================================================
 */

// ===== State =====
let currentType = 'masuk'; // masuk | keluar
let lastSaldo = 0;
let selectedFile = null;
let selectedFileBase64 = null;
let transactionData = [];

// ===== DOM References =====
const form = document.getElementById('transactionForm');
const inputTanggal = document.getElementById('inputTanggal');
const inputKeterangan = document.getElementById('inputKeterangan');
const inputMasuk = document.getElementById('inputMasuk');
const inputKeluar = document.getElementById('inputKeluar');
const inputBukti = document.getElementById('inputBukti');
const groupMasuk = document.getElementById('groupMasuk');
const groupKeluar = document.getElementById('groupKeluar');
const btnTypeMasuk = document.getElementById('btnTypeMasuk');
const btnTypeKeluar = document.getElementById('btnTypeKeluar');
const submitBtn = document.getElementById('submitBtn');
const uploadArea = document.getElementById('uploadArea');
const imagePreview = document.getElementById('imagePreview');
const previewImg = document.getElementById('previewImg');
const historyBody = document.getElementById('historyBody');
const emptyState = document.getElementById('emptyState');
const loadingOverlay = document.getElementById('loadingOverlay');
const estimatedSaldo = document.getElementById('estimatedSaldo');

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
  // Restore saved sheet from localStorage (or use default)
  const savedSheet = localStorage.getItem('pembukuan_active_sheet');
  if (savedSheet && CONFIG.SHEETS.some(s => s.name === savedSheet)) {
    CONFIG.SHEET_NAME = savedSheet;
  }
  
  // Render sheet tabs
  renderSheetTabs();

  // Set default date to today
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  inputTanggal.value = `${yyyy}-${mm}-${dd}`;

  // Setup drag and drop
  setupDragAndDrop();

  // Setup currency input listeners for saldo calc
  inputMasuk.addEventListener('input', updateEstimatedSaldo);
  inputKeluar.addEventListener('input', updateEstimatedSaldo);

  // Load data from spreadsheet
  loadData();
});

// ===== Sheet Tab Switcher =====
function renderSheetTabs() {
  const tabsContainer = document.getElementById('sheetTabs');
  if (!tabsContainer || !CONFIG.SHEETS) return;
  
  tabsContainer.innerHTML = CONFIG.SHEETS.map(sheet => `
    <button class="sheet-tab ${sheet.name === CONFIG.SHEET_NAME ? 'active' : ''}" 
            data-sheet="${sheet.name}" 
            onclick="switchSheet('${sheet.name}')">
      <span class="sheet-tab__icon">${sheet.icon}</span>
      <span class="sheet-tab__label">${sheet.label}</span>
    </button>
  `).join('');
}

function switchSheet(sheetName) {
  if (sheetName === CONFIG.SHEET_NAME) return;
  
  // Update config
  CONFIG.SHEET_NAME = sheetName;
  
  // Save to localStorage
  localStorage.setItem('pembukuan_active_sheet', sheetName);
  
  // Update active tab UI
  document.querySelectorAll('.sheet-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.sheet === sheetName);
  });
  
  // Clear current data & reload
  transactionData = [];
  lastSaldo = 0;
  renderHistory();
  updateStats();
  updateEstimatedSaldo();
  
  // Show loading toast
  showToast(`⏳ Memuat data ${sheetName}...`, 'warning');
  
  // Load data from new sheet
  loadData();
}

// ===== Transaction Type Toggle =====
function setTransactionType(type) {
  currentType = type;
  
  if (type === 'masuk') {
    btnTypeMasuk.className = 'type-toggle__btn active--masuk';
    btnTypeKeluar.className = 'type-toggle__btn';
    groupMasuk.style.display = '';
    groupKeluar.style.display = 'none';
    inputKeluar.value = '';
  } else {
    btnTypeMasuk.className = 'type-toggle__btn';
    btnTypeKeluar.className = 'type-toggle__btn active--keluar';
    groupMasuk.style.display = 'none';
    groupKeluar.style.display = '';
    inputMasuk.value = '';
  }
  
  updateEstimatedSaldo();
}

// ===== Currency Formatting =====
function formatCurrency(input) {
  // Remove non-digits
  let value = input.value.replace(/[^\d]/g, '');
  
  // Format with thousand separators
  if (value) {
    value = parseInt(value).toLocaleString('id-ID');
  }
  
  input.value = value;
  updateEstimatedSaldo();
}

function parseCurrency(value) {
  if (!value) return 0;
  return parseInt(value.replace(/[^\d]/g, '')) || 0;
}

function formatRupiah(amount) {
  if (amount === 0) return 'Rp0';
  return 'Rp' + Math.abs(amount).toLocaleString('id-ID');
}

// ===== Saldo Calculation =====
function updateEstimatedSaldo() {
  const masuk = parseCurrency(inputMasuk.value);
  const keluar = parseCurrency(inputKeluar.value);
  const estimated = lastSaldo + masuk - keluar;
  
  estimatedSaldo.textContent = formatRupiah(estimated);
  estimatedSaldo.style.color = estimated >= 0 ? 'var(--accent-secondary)' : 'var(--accent-danger)';
}

// ===== File Upload =====
function setupDragAndDrop() {
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      processFile(files[0]);
    }
  });
}

function handleFileSelect(input) {
  if (input.files && input.files[0]) {
    processFile(input.files[0]);
  }
}

function processFile(file) {
  // Validate file size (5MB max)
  if (file.size > 5 * 1024 * 1024) {
    showToast('Ukuran file terlalu besar! Maksimal 5MB.', 'error');
    return;
  }

  selectedFile = file;
  
  // Show preview
  const reader = new FileReader();
  reader.onload = (e) => {
    const fullDataUrl = e.target.result;
    previewImg.src = fullDataUrl;
    imagePreview.classList.add('visible');
    uploadArea.classList.add('has-file');
    uploadArea.style.display = 'none';
    
    // Extract base64 data (remove data:image/xxx;base64, prefix)
    selectedFileBase64 = fullDataUrl.split(',')[1];
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  selectedFile = null;
  selectedFileBase64 = null;
  previewImg.src = '';
  imagePreview.classList.remove('visible');
  uploadArea.classList.remove('has-file');
  uploadArea.style.display = '';
  inputBukti.value = '';
}

// ===== Form Submission via JSONP GET =====
let isSubmitting = false; // Guard against double-submit

form.addEventListener('submit', (e) => {
  e.preventDefault();
  
  // Prevent double-submit
  if (isSubmitting) return;
  
  // Validate Apps Script URL
  if (!CONFIG.APPS_SCRIPT_URL) {
    showToast('⚠️ URL Apps Script belum dikonfigurasi! Buka file config.js dan masukkan URL deployment.', 'warning');
    return;
  }

  // Get values
  const tanggalRaw = inputTanggal.value; // YYYY-MM-DD
  const dateParts = tanggalRaw.split('-');
  const tanggal = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`; // DD/MM/YYYY
  
  const keterangan = inputKeterangan.value.trim();
  const masuk = parseCurrency(inputMasuk.value);
  const keluar = parseCurrency(inputKeluar.value);

  // Validate
  if (!keterangan) {
    showToast('Keterangan tidak boleh kosong!', 'error');
    return;
  }
  
  if (masuk === 0 && keluar === 0) {
    showToast('Masukkan jumlah uang masuk atau keluar!', 'error');
    return;
  }

  // Lock submission
  isSubmitting = true;
  setLoading(true);
  
  // Capture photo data BEFORE resetForm() clears it
  const photoBase64 = selectedFileBase64;
  const photoFile = selectedFile;
  
  // === OPTIMISTIC UI: update table/stats immediately ===
  const estimatedSaldoValue = lastSaldo + masuk - keluar;
  const newEntry = {
    tanggal: tanggal,
    bukti: '',
    keterangan: keterangan,
    masuk: masuk,
    keluar: keluar,
    saldo: estimatedSaldoValue
  };
  transactionData.push(newEntry);
  lastSaldo = estimatedSaldoValue;
  renderHistory();
  updateStats();
  updateEstimatedSaldo();
  showToast('⏳ Menyimpan ke spreadsheet...', 'warning');
  resetForm();
  // === END OPTIMISTIC UI ===
  
  const callbackName = 'submitCallback_' + Date.now();
  const nonce = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const params = new URLSearchParams({
    action: 'add',
    callback: callbackName,
    nonce: nonce,
    sheet: CONFIG.SHEET_NAME,
    tanggal: tanggal,
    keterangan: keterangan,
    masuk: masuk.toString(),
    keluar: keluar.toString()
  });
  
  // Add photo data only if present (skip large files for URL limits)
  if (photoBase64 && photoFile && photoBase64.length < 8000) {
    params.set('buktiBase64', photoBase64);
    params.set('buktiFilename', photoFile.name);
  }

  // Setup JSONP callback
  window[callbackName] = function(result) {
    // Guard: only handle once
    if (!window[callbackName]) return;
    delete window[callbackName];
    const scriptEl = document.getElementById(callbackName);
    if (scriptEl) scriptEl.remove();
    
    isSubmitting = false;
    setLoading(false);
    
    if (result && result.success) {
      showToast('✅ Tersimpan!', 'success');
      // Sync with server data in background
      setTimeout(() => loadData(), 1000);
    } else {
      // Rollback optimistic update on error
      transactionData.pop();
      lastSaldo = transactionData.length > 0 ? transactionData[transactionData.length - 1].saldo : 0;
      renderHistory();
      updateStats();
      showToast('❌ Gagal: ' + (result?.error || 'Unknown error'), 'error');
    }
  };

  // Inject script tag
  const script = document.createElement('script');
  script.id = callbackName;
  script.src = CONFIG.APPS_SCRIPT_URL + '?' + params.toString();
  script.onerror = function() {
    delete window[callbackName];
    script.remove();
    isSubmitting = false;
    setLoading(false);
    // Rollback
    transactionData.pop();
    lastSaldo = transactionData.length > 0 ? transactionData[transactionData.length - 1].saldo : 0;
    renderHistory();
    updateStats();
    showToast('❌ Gagal mengirim data.', 'error');
  };
  document.body.appendChild(script);
});

function resetForm() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  inputTanggal.value = `${yyyy}-${mm}-${dd}`;
  
  inputKeterangan.value = '';
  inputMasuk.value = '';
  inputKeluar.value = '';
  removeImage();
  setTransactionType('masuk');
}

// ===== Edit/Update Functions =====
function openEditModal(index) {
  const entry = transactionData[index];
  if (!entry) return;

  document.getElementById('editRowIndex').value = index;
  document.getElementById('editKeterangan').value = entry.keterangan;
  
  // Convert DD/MM/YYYY to YYYY-MM-DD for date input
  const parts = entry.tanggal.split('/');
  if (parts.length === 3) {
    document.getElementById('editTanggal').value = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  }
  
  // Set currency values
  document.getElementById('editMasuk').value = entry.masuk > 0 ? entry.masuk.toLocaleString('id-ID') : '';
  document.getElementById('editKeluar').value = entry.keluar > 0 ? entry.keluar.toLocaleString('id-ID') : '';
  
  document.getElementById('editModal').classList.add('visible');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('visible');
}

function submitEdit(e) {
  e.preventDefault();
  
  const index = parseInt(document.getElementById('editRowIndex').value);
  const tanggalRaw = document.getElementById('editTanggal').value; // YYYY-MM-DD
  const dateParts = tanggalRaw.split('-');
  const tanggal = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`; // DD/MM/YYYY
  const keterangan = document.getElementById('editKeterangan').value.trim();
  const masuk = parseCurrency(document.getElementById('editMasuk').value);
  const keluar = parseCurrency(document.getElementById('editKeluar').value);
  
  if (!keterangan) {
    showToast('Keterangan tidak boleh kosong!', 'error');
    return;
  }
  
  // Spreadsheet row number = index + DATA_START_ROW (7)
  const rowNum = index + 7;
  
  closeEditModal();
  setLoading(true);
  showToast('⏳ Mengupdate data...', 'warning');
  
  // Optimistic UI update
  transactionData[index] = { ...transactionData[index], tanggal, keterangan, masuk, keluar };
  renderHistory();
  
  const callbackName = 'updateCallback_' + Date.now();
  const nonce = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const params = new URLSearchParams({
    action: 'update',
    callback: callbackName,
    nonce: nonce,
    sheet: CONFIG.SHEET_NAME,
    row: rowNum.toString(),
    tanggal: tanggal,
    keterangan: keterangan,
    masuk: masuk.toString(),
    keluar: keluar.toString()
  });
  
  window[callbackName] = function(result) {
    delete window[callbackName];
    const scriptEl = document.getElementById(callbackName);
    if (scriptEl) scriptEl.remove();
    setLoading(false);
    
    if (result && result.success) {
      showToast('✅ Data berhasil diupdate!', 'success');
      setTimeout(() => loadData(), 1000);
    } else {
      showToast('❌ Gagal update: ' + (result?.error || 'Unknown error'), 'error');
      loadData(); // Reload to restore original
    }
  };
  
  const script = document.createElement('script');
  script.id = callbackName;
  script.src = CONFIG.APPS_SCRIPT_URL + '?' + params.toString();
  script.onerror = function() {
    delete window[callbackName];
    script.remove();
    setLoading(false);
    showToast('❌ Gagal mengirim update.', 'error');
    loadData();
  };
  document.body.appendChild(script);
}

// ===== Load Data from Spreadsheet via Google Visualization API =====
function loadData() {
  if (!CONFIG.SPREADSHEET_ID) {
    showDemoData();
    return;
  }

  // Use Google Sheets Visualization API (no CORS issues, no Apps Script needed for reading)
  // This endpoint returns data as JSONP-compatible response
  // Range B7:G1000 = Tanggal(B), Bukti(C), Keterangan(D), Masuk(E), Keluar(F), Saldo(G)
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${CONFIG.SHEET_NAME}&range=B7:G1000`;

  // Setup callback namespace for gviz JSONP
  if (!window.google) window.google = {};
  if (!window.google.visualization) window.google.visualization = {};
  if (!window.google.visualization.Query) window.google.visualization.Query = {};

  window.google.visualization.Query.setResponse = function(response) {
    // Remove the injected script tag
    const scriptEl = document.getElementById('gviz-loader');
    if (scriptEl) scriptEl.remove();

    if (response.status === 'ok') {
      const parsed = parseGvizData(response.table);
      transactionData = parsed.data;
      lastSaldo = parsed.lastSaldo;
      renderHistory();
      updateStats();
      updateEstimatedSaldo();
    } else {
      console.error('Gviz error:', response.errors);
      showDemoData();
    }
  };

  // Remove old script if exists
  const old = document.getElementById('gviz-loader');
  if (old) old.remove();

  // Inject script tag to load data (JSONP-style, CORS-free)
  const script = document.createElement('script');
  script.id = 'gviz-loader';
  script.src = gvizUrl;
  script.onerror = function() {
    script.remove();
    console.error('Failed to load spreadsheet data');
    showDemoData();
  };
  document.body.appendChild(script);
}

/**
 * Parse gviz table format into our data model
 */
function parseGvizData(table) {
  const data = [];
  let lastSaldo = 0;

  if (!table || !table.rows) return { data: [], lastSaldo: 0 };

  for (const row of table.rows) {
    const cells = row.c;
    if (!cells) continue;

    // Column mapping: 0=Tanggal(B), 1=Bukti(C), 2=Keterangan(D), 3=Masuk(E), 4=Keluar(F), 5=Saldo(G)
    const tanggalRaw = cells[0] ? (cells[0].v || '') : '';
    const tanggalFormatted = cells[0] ? (cells[0].f || '') : '';
    const bukti = cells[1] ? (cells[1].v || '') : '';
    const keterangan = cells[2] ? (cells[2].v || '') : '';
    const masuk = cells[3] ? (parseFloat(cells[3].v) || 0) : 0;
    const keluar = cells[4] ? (parseFloat(cells[4].v) || 0) : 0;
    const saldo = cells[5] ? (parseFloat(cells[5].v) || 0) : 0;

    if (!tanggalRaw && !keterangan && masuk === 0 && keluar === 0) continue;

    // Format the date nicely (gviz returns "Date(yyyy,m,d)" format for date type)
    let formattedDate = tanggalFormatted || tanggalRaw;
    if (typeof tanggalRaw === 'string' && tanggalRaw.startsWith('Date(')) {
      const match = tanggalRaw.match(/Date\((\d+),(\d+),(\d+)\)/);
      if (match) {
        const d = String(match[3]).padStart(2, '0');
        const m = String(parseInt(match[2]) + 1).padStart(2, '0');
        const y = match[1];
        formattedDate = `${d}/${m}/${y}`;
      }
    }

    const entry = {
      tanggal: formattedDate,
      bukti: bukti.toString(),
      keterangan: keterangan.toString(),
      masuk,
      keluar,
      saldo
    };

    lastSaldo = saldo;
    data.push(entry);
  }

  return { data, lastSaldo };
}

function showDemoData() {
  // Show placeholder stats
  document.getElementById('totalMasuk').textContent = 'Rp—';
  document.getElementById('totalKeluar').textContent = 'Rp—';
  document.getElementById('currentSaldo').textContent = 'Rp—';
  estimatedSaldo.textContent = 'Rp—';
  
  emptyState.style.display = '';
  emptyState.querySelector('.empty-state__text').textContent = 
    'Tidak bisa memuat data. Pastikan spreadsheet dapat diakses oleh siapa saja (Anyone with link).';
}

// ===== Render History Table =====
function renderHistory() {
  if (!transactionData || transactionData.length === 0) {
    historyBody.innerHTML = '';
    emptyState.style.display = '';
    return;
  }

  emptyState.style.display = 'none';
  
  // Show newest first (but keep original index for editing)
  const indexed = transactionData.map((entry, i) => ({ ...entry, _index: i }));
  const reversed = indexed.reverse();
  
  historyBody.innerHTML = reversed.map(entry => `
    <tr>
      <td class="col-date">${escapeHtml(entry.tanggal)}</td>
      <td class="col-keterangan" title="${escapeHtml(entry.keterangan)}">${escapeHtml(entry.keterangan)}</td>
      <td class="col-bukti">
        ${entry.bukti ? `<a href="${escapeHtml(entry.bukti)}" target="_blank" rel="noopener">📷 Lihat</a>` : '<span style="color:var(--text-muted)">—</span>'}
      </td>
      <td class="col-masuk">${entry.masuk > 0 ? '+' + formatRupiah(entry.masuk) : '—'}</td>
      <td class="col-keluar">${entry.keluar > 0 ? '-' + formatRupiah(entry.keluar) : '—'}</td>
      <td class="col-saldo">${formatRupiah(entry.saldo)}</td>
      <td><button class="btn--edit" onclick="openEditModal(${entry._index})">✏️ Edit</button></td>
    </tr>
  `).join('');
}

// ===== Update Stats Cards =====
function updateStats() {
  let totalMasuk = 0;
  let totalKeluar = 0;
  
  transactionData.forEach(entry => {
    totalMasuk += entry.masuk || 0;
    totalKeluar += entry.keluar || 0;
  });

  animateValue('totalMasuk', formatRupiah(totalMasuk));
  animateValue('totalKeluar', formatRupiah(totalKeluar));
  animateValue('currentSaldo', formatRupiah(lastSaldo));
}

function animateValue(elementId, value) {
  const el = document.getElementById(elementId);
  el.style.animation = 'none';
  el.offsetHeight; // force reflow
  el.style.animation = 'countUp 0.4s ease-out';
  el.textContent = value;
}

// ===== UI Helpers =====
function setLoading(loading) {
  loadingOverlay.classList.toggle('visible', loading);
  submitBtn.classList.toggle('btn--loading', loading);
  submitBtn.disabled = loading;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Toast Notifications =====
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️'
  };
  
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__icon">${icons[type] || '💬'}</span>
    <span class="toast__message">${escapeHtml(message)}</span>
    <button class="toast__close" onclick="dismissToast(this)">&times;</button>
  `;
  
  container.appendChild(toast);
  
  // Auto dismiss after 5 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      dismissToast(toast.querySelector('.toast__close'));
    }
  }, 5000);
}

function dismissToast(closeBtn) {
  const toast = closeBtn.closest('.toast');
  toast.classList.add('toast--hiding');
  setTimeout(() => toast.remove(), 300);
}

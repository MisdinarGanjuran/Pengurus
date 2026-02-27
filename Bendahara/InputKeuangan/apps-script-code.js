/**
 * ============================================================
 *  PEMBUKUAN BENDAHARA - Google Apps Script Backend
 * ============================================================
 *  
 *  CARA PAKAI:
 *  1. Buka Spreadsheet → Extensions → Apps Script
 *  2. Hapus semua kode default, paste seluruh kode ini
 *  3. Klik Deploy → New deployment
 *  4. Pilih "Web app"
 *  5. Execute as: Me | Who has access: Anyone
 *  6. Klik Deploy → Copy URL
 *  7. Paste URL ke file config.js di website
 *
 * ============================================================
 */

// ===== KONFIGURASI =====
const SPREADSHEET_ID = '10fAaSqxmNQ0jj9C6LgzOHfD9IK4Pte4vCm3p_zN63q0';
const SHEET_NAME = 'KAS';
const HEADER_ROW = 6; // Baris header
const DATA_START_ROW = 7; // Baris mulai data
const DRIVE_FOLDER_NAME = 'Bukti_Pembukuan_Bendahara'; // Folder untuk foto

/**
 * Buka spreadsheet by ID (bukan getActiveSpreadsheet karena bisa null di web app)
 */
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Handle GET requests
 * - Tanpa action: ambil data riwayat transaksi
 * - action=add: tambah data transaksi baru
 * - sheet=NAMA_SHEET: pilih sheet mana yang digunakan
 * Mendukung JSONP callback untuk menghindari masalah CORS
 */
function doGet(e) {
  try {
    const action = e.parameter.action || 'read';
    // Allow frontend to specify which sheet to use
    const sheetName = e.parameter.sheet || SHEET_NAME;
    
    if (action === 'add') {
      return handleAddTransaction(e, sheetName);
    }
    
    if (action === 'update') {
      return handleUpdateTransaction(e, sheetName);
    }
    
    // Default: baca data
    return handleReadData(e, sheetName);
    
  } catch (error) {
    return createResponse(e, { success: false, error: error.toString() });
  }
}

/**
 * Baca data transaksi dari spreadsheet
 */
function handleReadData(e, sheetName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) {
    return createResponse(e, { success: true, data: [], lastSaldo: 0 });
  }
  
  const numRows = lastRow - DATA_START_ROW + 1;
  // Kolom B sampai G (kolom 2 sampai 7)
  const dataRange = sheet.getRange(DATA_START_ROW, 2, numRows, 6);
  const values = dataRange.getValues();
  const displayValues = dataRange.getDisplayValues();
  
  // BATCH: ambil semua formula kolom C sekaligus (1 API call vs N calls)
  const buktiRange = sheet.getRange(DATA_START_ROW, 3, numRows, 1);
  const formulas = buktiRange.getFormulas();
  
  const data = [];
  let lastSaldo = 0;
  
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const display = displayValues[i];
    
    // Skip empty rows
    if (!row[0] && !row[2] && !row[3] && !row[4]) continue;
    
    // Extract bukti link from HYPERLINK formula (already batched)
    let buktiLink = '';
    const formula = formulas[i][0];
    if (formula) {
      const match = formula.match(/HYPERLINK\("([^"]+)"/);
      if (match) buktiLink = match[1];
    } else if (row[1]) {
      buktiLink = row[1].toString();
    }
    
    const entry = {
      tanggal: display[0],
      bukti: buktiLink,
      keterangan: row[2] ? row[2].toString() : '',
      masuk: row[3] ? parseFloat(row[3]) : 0,
      keluar: row[4] ? parseFloat(row[4]) : 0,
      saldo: row[5] ? parseFloat(row[5]) : 0,
    };
    
    lastSaldo = entry.saldo;
    data.push(entry);
  }
  
  return createResponse(e, { 
    success: true, 
    data: data,
    lastSaldo: lastSaldo
  });
}

/**
 * Tambah transaksi baru ke spreadsheet via GET parameter
 */
function handleAddTransaction(e, sheetName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  
  // Parse data dari URL parameters
  const tanggal = e.parameter.tanggal || ''; // format: DD/MM/YYYY
  const keterangan = e.parameter.keterangan || '';
  const masuk = e.parameter.masuk ? parseFloat(e.parameter.masuk) : 0;
  const keluar = e.parameter.keluar ? parseFloat(e.parameter.keluar) : 0;
  
  // Upload foto jika ada (base64 dikirim via parameter bukti)
  let buktiLink = '';
  if (e.parameter.buktiBase64 && e.parameter.buktiFilename) {
    buktiLink = uploadImageToDrive(e.parameter.buktiBase64, e.parameter.buktiFilename);
  }
  
  // Hitung saldo
  const lastRow = sheet.getLastRow();
  let previousSaldo = 0;
  
  if (lastRow >= DATA_START_ROW) {
    previousSaldo = parseFloat(sheet.getRange(lastRow, 7).getValue()) || 0;
  }
  
  const saldo = previousSaldo + masuk - keluar;
  const newRow = lastRow + 1;
  
  // Parse tanggal
  const dateParts = tanggal.split('/');
  const dateObj = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
  
  // BATCH write: tulis semua kolom sekaligus (B-G = kolom 2-7, 6 kolom)
  // Ini JAUH lebih cepat daripada setValue() satu-satu
  const rowData = [
    dateObj,                    // B: Tanggal
    '',                         // C: Bukti (diisi formula di bawah jika ada)
    keterangan,                 // D: Keterangan
    masuk > 0 ? masuk : '',     // E: Masuk
    keluar > 0 ? keluar : '',   // F: Keluar
    saldo                       // G: Saldo
  ];
  
  const range = sheet.getRange(newRow, 2, 1, 6);
  range.setValues([rowData]);
  
  // BATCH format: set semua number format sekaligus
  range.setNumberFormats([['dd/MM/yyyy', '@', '@', 'Rp#,##0.00', 'Rp#,##0.00', 'Rp#,##0.00']]);
  
  // Set bukti hyperlink jika ada (harus terpisah karena pakai setFormula)
  if (buktiLink) {
    sheet.getRange(newRow, 3).setFormula('=HYPERLINK("' + buktiLink + '","📷 Lihat Bukti")');
  }
  
  return createResponse(e, {
    success: true,
    message: 'Data berhasil ditambahkan!',
    saldo: saldo
  });
}

/**
 * Update transaksi yang sudah ada di spreadsheet
 */
function handleUpdateTransaction(e, sheetName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  
  const row = parseInt(e.parameter.row);
  if (!row || row < DATA_START_ROW) {
    return createResponse(e, { success: false, error: 'Invalid row number' });
  }
  
  const tanggal = e.parameter.tanggal || '';
  const keterangan = e.parameter.keterangan || '';
  const masuk = e.parameter.masuk ? parseFloat(e.parameter.masuk) : 0;
  const keluar = e.parameter.keluar ? parseFloat(e.parameter.keluar) : 0;
  
  // Parse tanggal
  const dateParts = tanggal.split('/');
  const dateObj = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
  
  // Get previous saldo (row above) - 1 API call
  let previousSaldo = 0;
  if (row > DATA_START_ROW) {
    previousSaldo = parseFloat(sheet.getRange(row - 1, 7).getValue()) || 0;
  }
  const saldo = previousSaldo + masuk - keluar;
  
  // BATCH: Update tanggal(B), skip bukti(C), keterangan(D), masuk(E), keluar(F), saldo(G)
  // Write B, D-G in two batch operations (skip C to preserve bukti)
  sheet.getRange(row, 2).setValue(dateObj);
  
  const dataRange = sheet.getRange(row, 4, 1, 4); // D, E, F, G
  dataRange.setValues([[
    keterangan,
    masuk > 0 ? masuk : '',
    keluar > 0 ? keluar : '',
    saldo
  ]]);
  dataRange.setNumberFormats([['@', 'Rp#,##0.00', 'Rp#,##0.00', 'Rp#,##0.00']]);
  sheet.getRange(row, 2).setNumberFormat('dd/MM/yyyy');
  
  // BATCH recalculate saldo for all rows below
  const lastRow = sheet.getLastRow();
  if (row < lastRow) {
    const belowCount = lastRow - row;
    // 1 batch read: get all masuk(E) & keluar(F) for rows below
    const belowData = sheet.getRange(row + 1, 5, belowCount, 2).getValues();
    
    // Recalculate in-memory
    const newSaldos = [];
    let currentSaldo = saldo;
    for (let i = 0; i < belowData.length; i++) {
      const rMasuk = parseFloat(belowData[i][0]) || 0;
      const rKeluar = parseFloat(belowData[i][1]) || 0;
      currentSaldo = currentSaldo + rMasuk - rKeluar;
      newSaldos.push([currentSaldo]);
    }
    
    // 1 batch write: set all saldos at once
    const saldoRange = sheet.getRange(row + 1, 7, belowCount, 1);
    saldoRange.setValues(newSaldos);
    
    // 1 batch format
    const formats = newSaldos.map(() => ['Rp#,##0.00']);
    saldoRange.setNumberFormats(formats);
  }
  
  return createResponse(e, {
    success: true,
    message: 'Data berhasil diupdate!',
    saldo: saldo
  });
}

/**
 * Upload image Base64 ke Google Drive
 */
function uploadImageToDrive(base64Data, filename) {
  // Cari atau buat folder
  let folder;
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(DRIVE_FOLDER_NAME);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
  
  // Decode base64 dan buat file
  const contentType = getContentType(filename);
  const decoded = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(decoded, contentType, filename);
  
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return file.getUrl();
}

/**
 * Get MIME type dari filename
 */
function getContentType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const types = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp'
  };
  return types[ext] || 'image/jpeg';
}

/**
 * Create response - Supports both JSON and JSONP
 * JSONP digunakan untuk menghindari masalah CORS
 */
function createResponse(e, data) {
  const callback = e && e.parameter && e.parameter.callback;
  
  if (callback) {
    // JSONP response - wrap in callback function
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(data) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  
  // Regular JSON response
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

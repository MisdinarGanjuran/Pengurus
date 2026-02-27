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
  
  const data = [];
  let lastSaldo = 0;
  
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const display = displayValues[i];
    
    // Skip empty rows
    if (!row[0] && !row[2] && !row[3] && !row[4]) continue;
    
    // Extract bukti link from HYPERLINK formula
    let buktiLink = '';
    const cell = sheet.getRange(DATA_START_ROW + i, 3); // Column C = Bukti
    const formula = cell.getFormula();
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
 * Handle POST requests - Tambah data transaksi baru
 * Mendukung: JSON body (fetch) dan form-encoded (iframe submit)
 */
function doPost(e) {
  try {
    // Parse payload - bisa dari form (e.parameter.payload) atau body (e.postData.contents)
    let body;
    if (e.parameter && e.parameter.payload) {
      // Form submission via hidden iframe
      body = JSON.parse(e.parameter.payload);
    } else if (e.postData && e.postData.contents) {
      // Direct JSON body
      body = JSON.parse(e.postData.contents);
    } else {
      return createJsonResponse({ success: false, error: 'No data received' });
    }
    
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    // Parse data dari request
    const tanggal = body.tanggal; // format: DD/MM/YYYY
    const keterangan = body.keterangan || '';
    const masuk = body.masuk ? parseFloat(body.masuk) : 0;
    const keluar = body.keluar ? parseFloat(body.keluar) : 0;
    
    // Upload foto jika ada
    let buktiLink = '';
    if (body.buktiBase64 && body.buktiFilename) {
      buktiLink = uploadImageToDrive(body.buktiBase64, body.buktiFilename);
    }
    
    // Hitung saldo
    const lastRow = sheet.getLastRow();
    let previousSaldo = 0;
    
    if (lastRow >= DATA_START_ROW) {
      // Column G (7) = Saldo
      const lastSaldoCell = sheet.getRange(lastRow, 7);
      const lastSaldoValue = lastSaldoCell.getValue();
      if (lastSaldoValue) {
        previousSaldo = parseFloat(lastSaldoValue);
      }
    }
    
    const saldo = previousSaldo + masuk - keluar;
    
    // Append data ke baris berikutnya
    const newRow = lastRow + 1;
    
    // Parse tanggal string DD/MM/YYYY ke Date object
    const dateParts = tanggal.split('/');
    const dateObj = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
    
    // Column B (2) = Tanggal
    sheet.getRange(newRow, 2).setValue(dateObj);
    sheet.getRange(newRow, 2).setNumberFormat('dd/MM/yyyy');
    
    // Column C (3) = Bukti
    if (buktiLink) {
      sheet.getRange(newRow, 3).setFormula('=HYPERLINK("' + buktiLink + '","📷 Lihat Bukti")');
    }
    
    // Column D (4) = Keterangan
    sheet.getRange(newRow, 4).setValue(keterangan);
    
    // Column E (5) = Masuk
    if (masuk > 0) {
      sheet.getRange(newRow, 5).setValue(masuk);
      sheet.getRange(newRow, 5).setNumberFormat('Rp#,##0.00');
    }
    
    // Column F (6) = Keluar
    if (keluar > 0) {
      sheet.getRange(newRow, 6).setValue(keluar);
      sheet.getRange(newRow, 6).setNumberFormat('Rp#,##0.00');
    }
    
    // Column G (7) = Saldo
    sheet.getRange(newRow, 7).setValue(saldo);
    sheet.getRange(newRow, 7).setNumberFormat('Rp#,##0.00');
    
    return createJsonResponse({
      success: true,
      message: 'Data berhasil ditambahkan!',
      data: {
        tanggal: tanggal,
        bukti: buktiLink,
        keterangan: keterangan,
        masuk: masuk,
        keluar: keluar,
        saldo: saldo
      }
    });
    
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
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

/**
 * Create JSON response (for POST requests)
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

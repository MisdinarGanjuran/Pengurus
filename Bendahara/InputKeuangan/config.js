/**
 * ============================================================
 *  KONFIGURASI WEBSITE
 * ============================================================
 *  
 *  Ganti URL di bawah ini dengan URL deployment Apps Script kamu.
 *  
 *  Cara mendapatkan URL:
 *  1. Buka Google Spreadsheet
 *  2. Extensions → Apps Script
 *  3. Deploy → New deployment → Web app
 *  4. Copy URL yang muncul
 *  5. Paste di bawah ini menggantikan string kosong
 *
 * ============================================================
 */

const CONFIG = {
  // Paste URL Google Apps Script deployment kamu di sini
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwDQzEn9N03v01eeuSpLDCQivYnlbwca-JblOmLwu4hEV3rq7C-AF_-PJkrRnRp_566/exec',
  
  // ID Spreadsheet (diambil otomatis dari URL spreadsheet)
  SPREADSHEET_ID: '10fAaSqxmNQ0jj9C6LgzOHfD9IK4Pte4vCm3p_zN63q0',
  
  // Daftar tab/sheet yang tersedia
  SHEETS: [
    { name: 'KAS', icon: '💰', label: 'Kas' },
    { name: 'PROPOSAL', icon: '📄', label: 'Proposal' },
    { name: 'DANUS', icon: '🍽️', label: 'Danus' }
  ],
  
  // Sheet default (akan di-override oleh localStorage)
  SHEET_NAME: 'KAS',
  
  // Versi aplikasi
  VERSION: '1.0.0'
};

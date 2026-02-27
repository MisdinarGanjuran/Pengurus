# 📖 Panduan Setup - Pembukuan Bendahara

## Langkah 1: Buka Google Apps Script

1. Buka spreadsheet **Pembukuan Bendahara** di Google Sheets
2. Klik menu **Extensions** → **Apps Script**
3. Akan terbuka editor Apps Script di tab baru

## Langkah 2: Paste Kode Backend

1. Di editor Apps Script, **hapus semua kode default** (biasanya `function myFunction() {}`)
2. Buka file `apps-script-code.js` dari folder ini
3. **Copy seluruh isi** file tersebut
4. **Paste** ke editor Apps Script
5. Klik **💾 Save** (Ctrl+S)

## Langkah 3: Deploy sebagai Web App

1. Klik tombol **Deploy** → **New deployment**
2. Di bagian "Select type", klik ikon ⚙️ → pilih **Web app**
3. Isi konfigurasi:
   - **Description**: `Pembukuan Bendahara API`
   - **Execute as**: `Me` (akun kamu)
   - **Who has access**: `Anyone`
4. Klik **Deploy**
5. Jika diminta otorisasi:
   - Klik **Authorize access**
   - Pilih akun Google kamu
   - Klik **Advanced** → **Go to Pembukuan Bendahara (unsafe)**
   - Klik **Allow**
6. **Copy URL** deployment yang muncul (format: `https://script.google.com/macros/s/xxxxx/exec`)

## Langkah 4: Konfigurasi Website

1. Buka file `config.js` di folder website
2. Paste URL dari Langkah 3 ke dalam `APPS_SCRIPT_URL`:

```javascript
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/xxxxx/exec", // ← Paste URL di sini
  SHEET_NAME: "KAS",
  VERSION: "1.0.0",
};
```

3. Save file

## Langkah 5: Buka Website

1. Buka file `index.html` di browser (double-click)
2. Website siap digunakan! 🎉

---

## ❓ Troubleshooting

### Data tidak masuk ke spreadsheet

- Pastikan URL di `config.js` sudah benar
- Pastikan deployment access = "Anyone"
- Coba redeploy: **Deploy** → **Manage deployments** → **Edit** → **New version** → **Deploy**

### Foto tidak muncul

- Pastikan ukuran foto < 5MB
- Format yang didukung: JPG, PNG, WEBP
- Foto disimpan di Google Drive folder "Bukti_Pembukuan_Bendahara"

### Error otorisasi

- Buka Apps Script → **Run** → jalankan fungsi `doGet` secara manual
- Approve semua permission yang diminta
- Lalu redeploy

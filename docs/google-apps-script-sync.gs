/**
 * GOOGLE APPS SCRIPT - ĐỒNG BỘ 1 CHIỀU TỪ BÔNG SEN WORKSPACE SANG GOOGLE SHEETS
 *
 * Hướng dẫn cài đặt:
 * 1. Tạo 1 file Google Sheets mới trên Google Drive của công ty.
 * 2. Vào menu: Tiện ích mở rộng (Extensions) -> Apps Script.
 * 3. Dán toàn bộ đoạn code này vào Code.gs.
 * 4. Đổi giá trị SYNC_SECRET bên dưới thành một chuỗi bí mật mạnh của riêng bạn
 *    (khớp với biến GOOGLE_SHEETS_SYNC_SECRET trên Supabase Secrets).
 * 5. Bấm Triển khai (Deploy) -> Tạo triển khai mới (New deployment) -> Chọn loại: Ứng dụng web (Web app).
 *    - Thực thi với tư cách: Tôi (Me)
 *    - Ai có quyền truy cập: Bất kỳ ai (Anyone) -> bảo mật bằng SYNC_SECRET trong payload.
 * 6. Copy URL Web App (/exec) và lưu vào Supabase Secret: GOOGLE_SHEETS_WEBHOOK_URL.
 */

const SYNC_SECRET = 'THAY_CHUOI_BI_MAT_CUA_BAN_O_DAY';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (!payload || payload.secret !== SYNC_SECRET) {
      return ContentService.createTextOutput(
        JSON.stringify({ ok: false, error: 'Unauthorized: Sai SYNC_SECRET' })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    writeSheet(ss, 'KhachHang', payload.customersHeaders, payload.customersRows);
    writeSheet(ss, 'HoSo_DichVu', payload.casesHeaders, payload.casesRows);
    writeSheet(ss, 'TaiChinh_CongNo', payload.financeHeaders, payload.financeRows);

    return ContentService.createTextOutput(
      JSON.stringify({
        ok: true,
        syncedAt: new Date().toISOString(),
        customers: (payload.customersRows || []).length,
        cases: (payload.casesRows || []).length
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function writeSheet(ss, sheetName, headers, rows) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  sheet.clearContents();

  const allRows = [];
  if (headers && headers.length) allRows.push(headers);
  if (rows && rows.length) {
    rows.forEach(function (r) {
      allRows.push(r);
    });
  }

  if (allRows.length > 0) {
    sheet.getRange(1, 1, allRows.length, allRows[0].length).setValues(allRows);
    sheet.getRange(1, 1, 1, allRows[0].length).setFontWeight('bold').setBackground('#DBEAFE');
    sheet.setFrozenRows(1);
  }
}

/**
 * Drive.gs — อัปโหลดรูปผลงานขึ้น Google Drive
 * รูปเก็บในโฟลเดอร์ที่กำหนดผ่าน Script Property DRIVE_FOLDER_ID
 * ตั้ง sharing ให้ "ใครมีลิงก์เปิดดูได้" เพื่อให้ผู้ปกครองเปิดจากอีเมล/แอปได้
 */

function driveFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  // ถ้าไม่ตั้งไว้ สร้างโฟลเดอร์ให้อัตโนมัติแล้วจำ id
  const folder = DriveApp.createFolder('HomeLove-Photos');
  PropertiesService.getScriptProperties().setProperty('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

// dataUrl = "data:image/jpeg;base64,...."  คืน {url, fileId}
function uploadPhoto_(dataUrl, filename) {
  if (!dataUrl || dataUrl.indexOf('base64,') < 0) throw new Error('รูปไม่ถูกต้อง (ต้องเป็น data URL)');
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new Error('รูปไม่ถูกต้อง');
  const contentType = m[1];
  const bytes = Utilities.base64Decode(m[2]);
  const blob = Utilities.newBlob(bytes, contentType, filename || ('photo_' + Date.now()));
  const file = driveFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const fileId = file.getId();
  return {
    fileId: fileId,
    // เก็บลิงก์หน้าเปิดไฟล์ลงชีต (คนกดจากอีเมลก็เปิดได้ ไม่ใช่ลิงก์ที่ผูกกับวิธีฝังรูป)
    url: driveOpenUrl_(fileId),
  };
}

// ============ ลิงก์รูป ============
// ดึง file id ออกจากค่าที่เก็บในชีต รองรับทุกแบบที่เคยเก็บมา
// (uc?export=view&id=… ของเดิม, /file/d/…/view ของใหม่, หรือ id เปล่าๆ)
function driveFileId_(v) {
  if (!v) return '';
  const s = String(v);
  const m = s.match(/[?&]id=([-\w]+)/) || s.match(/\/file\/d\/([-\w]+)/) || s.match(/^([-\w]{20,})$/);
  return m ? m[1] : '';
}

/**
 * ลิงก์สำหรับฝังใน <img>
 * ต้องเป็น /thumbnail เท่านั้น — uc?export=view ที่เคยใช้ Google ปิดการฝังข้ามเว็บไปแล้ว
 * ฝังแล้วได้กล่องว่าง (หน้าตรวจงานของผู้ปกครองเลยไม่เห็นรูป)
 */
function drivePhotoSrc_(v) {
  const id = driveFileId_(v);
  return id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600' : '';
}

// หน้าเปิดดูไฟล์เต็มใน Drive (กดจากในแอป/อีเมล)
function driveOpenUrl_(v) {
  const id = driveFileId_(v);
  return id ? 'https://drive.google.com/file/d/' + id + '/view' : '';
}

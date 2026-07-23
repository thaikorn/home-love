/**
 * Mail.gs — แจ้งเตือนผู้ปกครองทางอีเมล (Gmail / MailApp)
 * ส่งเมื่อ: มีงานส่งมาตรวจ / มีคำขอแลกของ / มีคำอธิษฐานใหม่
 * ส่งหาอีเมลของผู้ปกครองทุกคนที่ตั้งไว้
 */

function parentEmails_() {
  return where_(TAB.Parents, function (p) { return p.email; })
    .map(function (p) { return p.email; });
}

function notifyParents_(subject, htmlBody) {
  const emails = parentEmails_();
  if (!emails.length) return;
  try {
    MailApp.sendEmail({
      to: emails.join(','),
      subject: '[Home Love] ' + subject,
      htmlBody: htmlBody,
    });
  } catch (e) {
    // อย่าให้อีเมลล้มเหลวทำให้ทั้ง request พัง (เช่นชนโควตา)
    Logger.log('ส่งอีเมลไม่สำเร็จ: ' + e.message);
  }
}

function mailNewSubmission_(child, chore, photoUrl) {
  notifyParents_(
    'มีงานรอตรวจ: ' + chore.name,
    '<p><b>' + esc_(child.name) + '</b> ส่งงาน <b>' + esc_(chore.name) + '</b> รอการตรวจ</p>' +
    (photoUrl ? '<p><a href="' + photoUrl + '">ดูรูปผลงาน</a></p>' : '')
  );
}

function mailNewRedemption_(child, reward) {
  notifyParents_(
    'มีคำขอแลกของ: ' + reward.name,
    '<p><b>' + esc_(child.name) + '</b> ขอแลก <b>' + esc_(reward.name) + '</b> (' + reward.cost + ' แต้ม) รออนุมัติ</p>'
  );
}

function mailNewWish_(child, text) {
  notifyParents_(
    'มีคำอธิษฐานใหม่',
    '<p><b>' + esc_(child.name) + '</b> อธิษฐานว่า:</p><blockquote>' + esc_(text) + '</blockquote>'
  );
}

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

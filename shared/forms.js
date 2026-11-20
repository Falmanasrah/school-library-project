// Printable versions of the school's paper forms, filled from the digital records:
//   Library Visits List (FAC-P-02-R6), Library Visitors Log (FAC-P-02-R5),
//   Student's Permission Slip to use the Library.
import { esc, fmtDate, dayName, fmtDateTime } from './core.js';

const EN = { weekday: 'long' };
function enDay(key) { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { ...EN, timeZone: 'UTC' }); }
function enDate(key) { const [y, m, d] = key.split('-').map(Number); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`; }
function arDay(key) { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ar-JO-u-nu-latn', { ...EN, timeZone: 'UTC' }); }

function head(settings) {
  return `<div class="p-head"><span>${esc(settings.schoolName || '')}</span><span class="ar">${esc(settings.schoolNameAr || '')}</span></div>`;
}
const libName = (lib) => (lib === 'junior' ? 'Junior library' : lib === 'senior' ? 'Senior library' : 'All libraries');

export function visitsListHtml({ settings, rows, from, to, library }) {
  const body = rows.map(v => `<tr>
      <td>${esc(enDay(v.date))}</td><td>${esc(enDate(v.date))}</td><td>${esc(v.gradeSection)}</td>
      <td>${v.status === 'no_show' ? '0' : esc(v.students)}</td><td>${esc(v.teacherName)}</td>
      <td>${v.classLanguage === 'arabic' ? 'Arabic' : 'English'}</td>
      <td class="l">${esc([v.status === 'no_show' ? 'Did not attend' : '', v.arrivedAt ? `${v.arrivedAt}${v.leftAt ? '–' + v.leftAt : ''}` : '', v.notes].filter(Boolean).join(' · '))}</td></tr>`).join('');
  const blanks = rows.length < 12 ? Array.from({ length: 12 - rows.length }, () => '<tr>' + '<td>&nbsp;</td>'.repeat(7) + '</tr>').join('') : '';
  return `<div class="print-doc">${head(settings)}
    <h1>Library Visits List</h1>
    <h2>${esc(libName(library))} · ${esc(enDate(from))}${to !== from ? ' – ' + esc(enDate(to)) : ''}</h2>
    <table><thead><tr><th>Day</th><th>Date</th><th>Grade / Section</th><th>Number of students</th><th>Teacher Name</th><th>Arabic / English class</th><th>Notes</th></tr></thead>
    <tbody>${body}${blanks}</tbody></table>
    <div class="p-foot"><span>${esc(settings.visitsListFormCode || '')}</span><span>Printed ${esc(new Date().toLocaleString('en-GB'))}</span></div></div>`;
}

export function visitorsLogHtml({ settings, rows, from, to, library }) {
  const byDay = new Map();
  for (const r of rows) { if (!byDay.has(r.date)) byDay.set(r.date, []); byDay.get(r.date).push(r); }
  if (!byDay.size) byDay.set(from, []);
  const pages = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, list], i, all) => {
    const body = list.map((r, n) => `<tr><td>${n + 1}</td><td class="l">${esc(r.name)}</td><td>${esc(r.className)}</td><td class="l">${esc(r.purpose)}${r.entranceTime ? ` <small>(${esc(r.entranceTime)}${r.exitTime ? '–' + esc(r.exitTime) : ''})</small>` : ''}</td></tr>`).join('');
    const blanks = list.length < 15 ? Array.from({ length: 15 - list.length }, (_, k) => `<tr><td>${list.length + k + 1}</td><td>&nbsp;</td><td></td><td></td></tr>`).join('') : '';
    return `<div class="print-doc${i < all.length - 1 ? ' page-break' : ''}">${head(settings)}
      <h1>Library Visitors Log</h1>
      <h2>${esc(libName(library))}</h2>
      <div class="p-meta"><span><b>Day:</b> ${esc(enDay(date))} / ${esc(arDay(date))}</span><span><b>Date:</b> ${esc(enDate(date))}</span></div>
      <table><thead><tr><th style="width:8%">No.</th><th>Name</th><th style="width:16%">Class</th><th>Purpose of visit</th></tr></thead><tbody>${body}${blanks}</tbody></table>
      <div class="p-total">Total: ${list.length}</div>
      <div class="p-foot"><span>${esc(settings.visitorsLogFormCode || '')}</span><span>Printed ${esc(new Date().toLocaleString('en-GB'))}</span></div></div>`;
  });
  return pages.join('');
}

const REASONS = { borrow_return: 'Borrow / return a book', reading: 'Reading', research: 'Research / project', study: 'Study', other: 'Other' };
export function slipReason(s) { return s.reason === 'other' && s.reasonText ? s.reasonText : (REASONS[s.reason] || s.reason); }

export function slipHtml({ settings, slips }) {
  return `<div class="print-doc">${slips.map(s => `<div class="slip">${head(settings)}
      <h1 style="direction:rtl">إذن استخدام المكتبة من قبل الطلبة</h1>
      <h2><u>Student's Permission slip to use the Library</u></h2>
      <div class="p-meta"><span><b>Teacher Name / اسم المعلم/ة:</b> ${esc(s.teacherName)}</span><span><b>Date/Day / اليوم والتاريخ:</b> ${esc(enDay(s.date))} ${esc(enDate(s.date))}</span></div>
      <table>
        <tr><td>Student Name / اسم الطالب/ة</td><td class="l">${esc(s.studentName)}${s.studentId ? ` (ID ${esc(s.studentId)})` : ''}</td></tr>
        <tr><td>Grade / الصف</td><td class="l">${esc(s.grade)}</td></tr>
        <tr><td>Entrance Time / وقت دخول المكتبة</td><td class="l">${esc(s.entranceTime || '')}</td></tr>
        <tr><td>Exit Time / وقت الخروج من المكتبة</td><td class="l">${esc(s.exitTime || '')}</td></tr>
        <tr><td>Visit's Reason / سبب زيارة المكتبة</td><td class="l">${esc(slipReason(s))}${s.notes ? ' — ' + esc(s.notes) : ''}</td></tr>
        <tr><td>Library</td><td class="l">${esc(libName(s.library))}</td></tr>
      </table>
      <p style="margin:12px 0 4px"><b>Supervisor's signature / توقيع المشرف/ة:</b> Digitally signed by ${esc(s.supervisorName)} at ${esc(new Date(s.signedAt).toLocaleString('en-GB'))}</p>
      <p style="margin:0;font-size:10pt">Slip code: <b>${esc(s.code)}</b> · Status: ${esc(s.status)}${s.verifiedByName ? ` · Verified by ${esc(s.verifiedByName)}` : ''}</p>
    </div>`).join('')}</div>`;
}

export { fmtDate, dayName, fmtDateTime };

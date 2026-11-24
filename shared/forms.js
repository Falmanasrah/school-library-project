// Printable versions of the school's paper forms, laid out exactly like the paper and filled
// from the digital records:
//   Library Visits List (FAC-P-02-R6), Library Visitors Log (FAC-P-02-R5),
//   Student's Permission slip to use the Library.
// Every page carries the school's own header (shared/school-header.png).
import { esc, fmtDate, dayName, fmtDateTime } from './core.js';

export const HEADER_IMG = '/shared/school-header.png';
const parts = (key) => key.split('-').map(Number);
function enDay(key) { const [y, m, d] = parts(key); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }); }
function enDate(key) { const [y, m, d] = parts(key); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`; }
function arDay(key) { const [y, m, d] = parts(key); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ar-JO-u-nu-latn', { weekday: 'long', timeZone: 'UTC' }); }
const banner = () => `<img class="p-banner" src="${HEADER_IMG}" alt="International Independent Schools" />`;
const chunk = (list, n) => { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out.length ? out : [[]]; };

/* ---------- Library Visits List (FAC-P-02-R6): 5 rows a page, like the paper ---------- */
export function visitsListHtml({ settings, rows }) {
  const code = esc(settings.visitsListFormCode || 'FAC-P-02-R6');
  return chunk(rows, 5).map(page => {
    const body = Array.from({ length: 5 }, (_, i) => {
      const v = page[i];
      if (!v) return '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
      const notes = [v.status === 'no_show' ? 'Did not attend' : '', v.arrivedAt ? `${v.arrivedAt}${v.leftAt ? '–' + v.leftAt : ''}` : '', v.notes].filter(Boolean).join(' · ');
      return `<tr><td>${esc(enDay(v.date))}</td><td>${esc(enDate(v.date))}</td><td>${esc(v.gradeSection)}</td><td>${v.status === 'no_show' ? '0' : esc(v.students)}</td>
        <td>${esc(v.teacherName)}</td><td>${v.classLanguage === 'arabic' ? 'Arabic' : 'English'}</td><td class="l">${esc(notes)}</td></tr>`;
    }).join('');
    return `<section class="print-doc a4 f-visits">${banner()}
      <h1>Library Visits List</h1>
      <table><colgroup><col style="width:11.3%"><col style="width:12.5%"><col style="width:11%"><col style="width:12%"><col style="width:17.3%"><col style="width:13.2%"><col style="width:22.7%"></colgroup>
        <thead><tr><th>Day</th><th>Date</th><th>Grade /<br>Section</th><th>Number<br>of<br>students</th><th>Teacher<br>Name</th><th>Arabic /<br>English<br>class</th><th>Notes</th></tr></thead>
        <tbody>${body}</tbody></table>
      <div class="p-code">${code}</div></section>`;
  }).join('');
}

/* ---------- Library Visitors Log (FAC-P-02-R5): one sheet per day, 11 rows, then Total ---------- */
const VISITOR_ROWS = 11;
export function visitorsLogHtml({ settings, rows, from }) {
  const code = esc(settings.visitorsLogFormCode || 'FAC-P-02-R5');
  const byDay = new Map();
  for (const r of rows) { if (!byDay.has(r.date)) byDay.set(r.date, []); byDay.get(r.date).push(r); }
  if (!byDay.size) byDay.set(from, []);
  const pages = [];
  for (const [date, list] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sheets = chunk(list, VISITOR_ROWS);
    sheets.forEach((page, s) => {
      const start = s * VISITOR_ROWS;
      const body = Array.from({ length: VISITOR_ROWS }, (_, i) => {
        const r = page[i];
        return r ? `<tr><td>${start + i + 1}</td><td class="l">${esc(r.name)}</td><td>${esc(r.className)}</td><td class="l">${esc(r.purpose)}</td></tr>` : '<tr><td></td><td></td><td></td><td></td></tr>';
      }).join('');
      const last = s === sheets.length - 1;
      pages.push(`<section class="print-doc a4 f-visitors">${banner()}
        <h1>Library Visitors Log</h1>
        <div class="p-daydate"><span>Day: ${esc(enDay(date))}</span><span>Date: ${esc(enDate(date))}</span></div>
        <table><colgroup><col style="width:8%"><col style="width:38%"><col style="width:15%"><col style="width:39%"></colgroup>
          <thead><tr><th>No.</th><th>Name</th><th>Class</th><th>Purpose of visit</th></tr></thead>
          <tbody>${body}<tr><td></td><td colspan="3"></td></tr><tr class="total"><td></td><td colspan="3" class="l">Total: ${last ? list.length : ''}</td></tr></tbody></table>
        <div class="p-code">${code}</div></section>`);
    });
  }
  return pages.join('');
}

/* ---------- Student's Permission slip: two slips on each A4 sheet ---------- */
const REASONS = { borrow_return: 'Borrow / return a book', reading: 'Reading', research: 'Research / project', study: 'Study', other: 'Other' };
export function slipReason(s) { return s.reason === 'other' && s.reasonText ? s.reasonText : (REASONS[s.reason] || s.reason); }

function slipBox(s) {
  const when = `${enDay(s.date)} ${enDate(s.date)}`;
  const whenAr = `${arDay(s.date)} ${enDate(s.date)}`;
  const reason = slipReason(s) + (s.notes ? ' — ' + s.notes : '');
  return `<div class="slip">${banner()}
    <div class="s-title-ar" dir="rtl">إذن استخدام المكتبة من قبل الطلبة</div>
    <div class="s-title-en">Student's Permission slip to use the Library</div>
    <div class="s-line s-ar" dir="rtl"><span>اسم المعلم/ة:</span><span class="dots">${esc(s.teacherName)}</span><span>اليوم والتاريخ:</span><span class="dots">${esc(whenAr)}</span></div>
    <div class="s-line s-en"><span>Teacher Name:</span><span class="dots">${esc(s.teacherName)}</span><span>Date/Day:</span><span class="dots">${esc(when)}</span></div>
    <table class="s-tab"><colgroup><col style="width:41%"><col style="width:36%"><col style="width:23%"></colgroup>
      <tr class="r1"><td colspan="2" class="v">${esc(s.studentName)}${s.studentId ? ` (ID ${esc(s.studentId)})` : ''}</td><td class="lab"><span class="ar">اسم الطالب/ة:</span><span>Student Name</span></td></tr>
      <tr class="r2"><td colspan="2" class="v">${esc(s.grade)}</td><td class="lab"><span class="ar">الصف :</span><span>Grade</span></td></tr>
      <tr class="r3"><td class="exit"><span class="v">${esc(s.exitTime || '')}</span><span class="lab-in"><span class="ar">وقت الخروج من المكتبة</span><span>Exit Time</span></span></td><td class="v">${esc(s.entranceTime || '')}</td><td class="lab"><span class="ar">وقت دخول المكتبة</span><span>Entrance Time</span></td></tr>
      <tr class="r4"><td colspan="2" class="v">${esc(reason)}</td><td class="lab"><span class="ar">سبب زيارة المكتبة :</span><span>Visit's Reason</span></td></tr>
    </table>
    <div class="s-sig"><div class="ar" dir="rtl">توقيع المشرف/ة:</div><div>Supervisor's signature: <span class="sig">${esc(s.supervisorName)}</span></div></div>
    <div class="s-code">${esc(s.code || '')}</div>
  </div>`;
}
export function slipHtml({ slips }) {
  return chunk(slips, 2).map(pair => `<section class="print-doc a4 f-slips">${pair.map(slipBox).join('')}</section>`).join('');
}

export { fmtDate, dayName, fmtDateTime };

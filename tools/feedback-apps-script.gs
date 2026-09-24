/**
 * Simple Fielding — test-report receiver (Google Apps Script, bound to the "test reports" Sheet).
 *
 * The app's "Something wrong?" button POSTs a report here while tester mode is on. Each report becomes a
 * row: what the tester says should have happened, and a log of the play exactly as the app ran it, with a
 * replay link that reproduces it.
 *
 * Setup (once):
 *   1. Open the Sheet → Extensions → Apps Script. Replace the contents with this file. Save.
 *   2. Deploy → New deployment → type "Web app".
 *        Execute as: Me.   Who has access: Anyone.
 *   3. Copy the web app URL (it ends in /exec). In the app: Settings → tap the version number five times →
 *      paste it into "Report to". It is stored on that device only; it is never committed to the repo.
 *
 * "Anyone" is required so the phone can post without signing in. The URL is the only thing that lets
 * someone post, so keep it out of anything public. The checks below reject anything that isn't a report.
 */

const MAX_BYTES = 60000;

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > MAX_BYTES) return reply({ ok: false, error: 'bad size' });
    const r = JSON.parse(raw);
    if (r.app !== 'simple-fielding' || typeof r.said !== 'string' || !r.play) return reply({ ok: false, error: 'not a report' });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const p = r.play;
    sheet.appendRow([
      new Date(),
      str(r.id, 40),
      str(r.version, 20),
      str(r.said, 2000),
      str((r.positions || []).join(', '), 100),
      str(p.title, 200),
      str(r.situationText, 300),
      str(r.eventText, 300),
      str(r.didText, 3000),
      str(r.replay, 1000),
      str(r.device, 200),
      str(JSON.stringify(p), 45000),
    ]);
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err).slice(0, 200) });
  }
}

// Lets you check the deployment in a browser: it should say "ready".
function doGet() {
  return reply({ ok: true, ready: true });
}

function str(v, max) {
  const s = v == null ? '' : String(v);
  // Leading = + - @ would be read as a formula by Sheets.
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
  return safe.slice(0, max);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

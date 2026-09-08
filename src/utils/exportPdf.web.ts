/**
 * PlatoPlan - PDF export (Web)
 *
 * On the web there is no native PDF API, so we open a print-friendly HTML
 * document in a new window and trigger the browser's print dialog, where the
 * user can choose "Save as PDF" or send it to a printer.
 *
 * The caller provides an already-built HTML body; this util wraps it in a
 * minimal, print-optimised document.
 */

export interface ExportPdfOptions {
  /** Document title (used for the print dialog / saved file name). */
  title: string;
  /** HTML for the document body. Caller is responsible for escaping user text. */
  bodyHtml: string;
  /**
   * Page layout:
   * - 'vertical' (default): portrait, one day per row (compact list).
   * - 'horizontal': landscape, calendar weeks grid (Mon–Sun columns).
   */
  orientation?: 'vertical' | 'horizontal';
}

function buildDocument({ title, bodyHtml, orientation = 'vertical' }: ExportPdfOptions): string {
  const isHorizontal = orientation === 'horizontal';
  const pageCss = isHorizontal
    ? '@page { size: A4 landscape; margin: 8mm; }'
    : '@page { size: A4 portrait; margin: 12mm; }';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .subtitle { color: #666; font-size: 13px; margin: 0 0 16px; }

  /* Vertical (list) layout: one day per row. */
  .days { display: flex; flex-direction: column; gap: 8px; }
  .day-block { break-inside: avoid; page-break-inside: avoid; }
  .day-row { display: flex; align-items: stretch; gap: 8px; break-inside: avoid; page-break-inside: avoid; }
  .day-date { width: 56px; flex: 0 0 56px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #FAF9F6; border: 1px solid #EFECE6; border-radius: 8px; padding: 6px 0; }
  .day-weekday { font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; }
  .day-number { font-size: 18px; font-weight: 700; color: #1a1a1a; line-height: 20px; }
  .day-month { font-size: 10px; color: #aaa; }
  .day-cards { flex: 1; display: flex; gap: 8px; }

  /* Horizontal (weeks grid) layout: mirrors the on-screen calendar. */
  .weeks { display: flex; flex-direction: column; gap: 6px; }
  .week-header, .week-row { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
  .week-header-cell { font-size: 10px; font-weight: 700; color: #8a94a6; text-transform: uppercase; text-align: center; padding-bottom: 2px; }
  .week-row { break-inside: avoid; page-break-inside: avoid; }
  .week-cell { display: flex; flex-direction: column; gap: 4px; min-height: 90px; }
  .week-cell-empty { background: #FAFAFA; border: 1px dashed #ECECEC; border-radius: 9px; }
  .week-date { display: flex; align-items: baseline; gap: 4px; }
  .week-date .day-weekday { font-size: 9px; }
  .week-date .day-number { font-size: 14px; line-height: 16px; }
  .week-date .day-month { font-size: 9px; }
  .week-cell .card { flex: none; }
  .week-cell .card-value { font-size: 11px; }

  .card { flex: 1; background: #F5F7FA; border: 1px solid #E6E9EE; border-radius: 9px; padding: 8px 10px; }
  .card-label { font-size: 10px; font-weight: 600; color: #8a94a6; text-transform: uppercase; letter-spacing: 0.4px; }
  .card-value { font-size: 13px; font-weight: 500; color: #1a1a1a; margin-top: 3px; }
  .card-empty { border-style: dashed; border-color: #E0C97F; background: #FFFDF5; }
  .card-value-empty { color: #B08D2E; font-style: italic; }
  .card-free { background: #FDECEA; border-color: #F5B7B1; }
  .card-label-free { color: #C0392B; }
  .card-value-free { color: #C0392B; font-weight: 600; text-decoration: line-through; }
  .card-complex { border-left: 4px solid #F1C40F; background: #FEF9E7; }
  .card-note { font-size: 11px; color: #B7950B; font-style: italic; margin-top: 3px; }
  .day-note { margin: 4px 0 0 64px; background: #FFF9C4; padding: 6px 8px; border-radius: 6px; font-size: 12px; color: #F57F17; font-weight: 500; break-inside: avoid; }
  .week-cell .day-note { margin: 0; font-size: 10px; padding: 4px 6px; }

  .reminders { margin-top: 16px; padding: 12px; background: #fef9e7; border: 1px solid #f1c40f; border-radius: 6px; font-size: 12px; break-inside: avoid; }
  .reminders h2 { font-size: 13px; margin: 0 0 6px; }
  .reminders ul { margin: 0; padding-left: 18px; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
    ${pageCss}
  }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/**
 * Prints a freshly-built print document via a hidden iframe.
 *
 * Using an iframe with srcdoc (instead of window.open + document.write) is more
 * reliable: it isn't blocked by popup blockers, always contains exactly the
 * HTML we just generated (no stale-content risk), and lets us print only after
 * the iframe's content has actually loaded and laid out.
 */
export function exportPdf(options: ExportPdfOptions): boolean {
  const html = buildDocument(options);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  // srcdoc guarantees the iframe renders exactly this document.
  iframe.srcdoc = html;

  const cleanup = () => {
    // Remove after the print dialog has had time to open.
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1000);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    // Wait a frame so fonts/layout settle, then print just this iframe.
    requestAnimationFrame(() => {
      try {
        win.focus();
        win.print();
      } catch {
        // ignore
      } finally {
        cleanup();
      }
    });
  };

  document.body.appendChild(iframe);
  return true;
}

/** Escapes text for safe insertion into HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

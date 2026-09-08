/**
 * PlatoPlan - PDF export (Native fallback)
 *
 * PDF generation on native uses expo-print, which is not installed yet.
 * Until it is wired up, this fallback informs the user that PDF export is
 * currently available on the web version. The web implementation lives in
 * exportPdf.web.ts.
 */

import { AlertCompat } from './alert';

export interface ExportPdfOptions {
  title: string;
  bodyHtml: string;
}

/**
 * Native placeholder: PDF export is web-only for now.
 * Returns false to signal it did not produce a PDF.
 */
export function exportPdf(_options: ExportPdfOptions): boolean {
  AlertCompat.alert(
    'PDF',
    'La exportación en PDF está disponible por ahora en la versión web. Usa "Exportar como texto" en el móvil.'
  );
  return false;
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

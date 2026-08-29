/**
 * PlatoPlan - Share/Export utility (Web)
 *
 * react-native-web does not implement Share.share, so this uses the
 * Web Share API when available and degrades to clipboard + file download.
 */

import { AlertCompat } from './alert';

function slugify(title: string): string {
  return (
    title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'platoplan'
  );
}

function downloadAsFile(title: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(title)}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText && globalThis.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea fallback below.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export async function shareText(title: string, text: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (error) {
      // User dismissed the native sheet: nothing else to do.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
    }
  }

  const copied = await copyToClipboard(text);
  downloadAsFile(title, text);

  AlertCompat.alert(
    title,
    copied
      ? 'Copiado al portapapeles y descargado como archivo de texto.'
      : 'Descargado como archivo de texto.'
  );
}

import { isNativeApp } from './native';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Lets the user keep a file the app made (PDF report, CSV, backup):
 * - native app: saved to the app's cache and handed to the share sheet (Save to Files, AirDrop, email);
 * - phone browser: the share sheet when it can take files;
 * - otherwise: a normal download.
 */
export async function saveFile(fileName: string, blob: Blob, title: string): Promise<void> {
  if (isNativeApp) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const written = await Filesystem.writeFile({ path: fileName, data: await blobToBase64(blob), directory: Directory.Cache });
    try {
      await Share.share({ title, files: [written.uri] });
    } catch {
      /* closed the share sheet */
    }
    return;
  }

  const file = new File([blob], fileName, { type: blob.type });
  if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return; // closed the share sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toPublicFileUrl(fileUrl?: string | null) {
  if (!fileUrl) return '#';
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) return fileUrl;

  const configuredApiUrl = import.meta.env.VITE_API_URL || '/api';
  const apiUrl =
    typeof window !== 'undefined' &&
    !['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname) &&
    (() => {
      try {
        return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(configuredApiUrl, window.location.origin).hostname);
      } catch {
        return false;
      }
    })()
      ? '/api'
      : configuredApiUrl;
  const path = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
  const apiBase = apiUrl.replace(/\/$/, '');
  return `${apiBase}/files?path=${encodeURIComponent(path)}`;
}

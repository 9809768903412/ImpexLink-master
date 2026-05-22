export function toPublicFileUrl(fileUrl?: string | null) {
  if (!fileUrl) return '#';
  const trimmed = String(fileUrl).trim();
  if (!trimmed) return '#';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;

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
  const apiBase = apiUrl.replace(/\/$/, '');

  if (trimmed.startsWith('/api/files') || trimmed.startsWith('api/files')) {
    const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const suffix = normalized.replace(/^\/api/, '');
    return `${apiBase}${suffix}`;
  }

  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${apiBase}/files?path=${encodeURIComponent(path)}`;
}

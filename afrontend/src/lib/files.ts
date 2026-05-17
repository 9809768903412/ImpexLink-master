export function toPublicFileUrl(fileUrl?: string | null) {
  if (!fileUrl) return '#';
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) return fileUrl;

  const apiUrl = import.meta.env.VITE_API_URL || '/api';
  const path = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
  const apiBase = apiUrl.replace(/\/$/, '');
  return `${apiBase}/files?path=${encodeURIComponent(path)}`;
}

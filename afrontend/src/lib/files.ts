export function toPublicFileUrl(fileUrl?: string | null) {
  if (!fileUrl) return '#';
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) return fileUrl;

  const apiUrl = import.meta.env.VITE_API_URL || '/api';
  const base = apiUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
  const path = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
  return `${base}${path}`;
}

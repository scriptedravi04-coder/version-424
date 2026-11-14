// Session 42: moved out of api.js so apiSnapshot.js can use it without a circular import.
export function normalizeApiUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  
  let clean = url.trim();
  while (clean.startsWith('/')) {
    clean = clean.substring(1);
  }
  if (clean.startsWith('api/')) {
    clean = clean.substring(4);
  }
  while (clean.startsWith('/')) {
    clean = clean.substring(1);
  }
  return `/api/${clean}`;
}

let rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
rawApiUrl = rawApiUrl.replace(/\/+$/, '');
if (rawApiUrl && !rawApiUrl.endsWith('/api/v1')) {
  rawApiUrl = `${rawApiUrl}/api/v1`;
}
const apiBaseUrl = rawApiUrl;
const backendOrigin = apiBaseUrl.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');

export function getRecipeImageUrl(imageUrl?: string | null) {
  const value = imageUrl?.trim();
  if (!value) return '';

  if (/^(https?:|data:|blob:)/i.test(value)) {
    return value;
  }

  if (value.startsWith('/')) {
    return `${backendOrigin}${value}`;
  }

  if (value.startsWith('uploads/')) {
    return `${backendOrigin}/${value}`;
  }

  return `${backendOrigin}/uploads/recipes/${value}`;
}

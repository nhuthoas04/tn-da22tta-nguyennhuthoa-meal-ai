const getFallbackApiUrl = () => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return 'https://tn-da22tta-nguyennhuthoa-meal-ai-backend.onrender.com/api/v1';
    }
  }
  return 'http://localhost:3001/api/v1';
};

let rawApiUrl = process.env.NEXT_PUBLIC_API_URL || getFallbackApiUrl();
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

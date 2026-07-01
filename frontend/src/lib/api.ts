import axios, { type AxiosResponse } from 'axios';
import { normalizeWeekStart, notifyMealPlanChanged } from './mealPlanEvents';

const API_VERSION_PREFIX = '/api/v1';

const normalizeApiBaseUrl = (value?: string) => {
    const fallback = 'http://localhost:3001';
    const base = (value || fallback).trim().replace(/\/+$/, '');
    const withoutDuplicatePrefix = base.replace(/(\/api\/v1)+$/i, '');
    return `${withoutDuplicatePrefix}${API_VERSION_PREFIX}`;
};

// Create axios instance configured for our NestJS backend.
const getFallbackApiUrl = () => {
    if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        if (host !== 'localhost' && host !== '127.0.0.1') {
            return 'https://tn-da22tta-nguyennhuthoa-meal-ai-backend.onrender.com/api/v1';
        }
    }
    return 'http://localhost:3001/api/v1';
};

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || getFallbackApiUrl();

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach JWT token to every request
api.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token =
            localStorage.getItem('token') ||
            localStorage.getItem('accessToken') ||
            localStorage.getItem('authToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }
    return config;
});

// Response interceptor: handle 401 by redirecting to login
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401 && typeof window !== 'undefined') {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;

// ==================== HEALTH API ====================
export const healthAPI = {
    wake: () =>
        api.get('/health', {
            timeout: 70000,
            headers: { 'Cache-Control': 'no-cache' },
        }),
};

// ==================== AUTH API ====================
export const authAPI = {
    register: (data: { email: string; password: string; fullName: string }) =>
        api.post('/auth/register', data),
    login: (data: { email: string; password: string }) =>
        api.post('/auth/login', data, { timeout: 70000 }),
    getProfile: () => api.get('/auth/profile'),
    updateProfile: (data: any) => api.put('/auth/profile', data),
    getProfileStats: () => api.get('/auth/profile/stats'),
    adminListAllUsers: () => api.get('/auth/admin/users'),
    adminCreateUser: (data: any) => api.post('/auth/admin/users', data),
    adminUpdateUser: (id: string, data: any) => api.put(`/auth/admin/users/${id}`, data),
    adminDeleteUser: (id: string) => api.delete(`/auth/admin/users/${id}`),
    
    // Password Reset
    forgotPassword: (email: string) =>
        api.post('/auth/forgot-password', { email }, { timeout: 12000 }),
    resetPassword: (data: any) => api.post('/auth/reset-password', data),

};

// ==================== RECIPES API ====================
export const recipesAPI = {
    getAll: (params?: any) => api.get('/recipes', { params }),
    getById: (id: string) => api.get(`/recipes/${id}`),
    getMyReviews: (params?: any) => api.get('/recipes/my-reviews', { params }),
    // User submission
    submit: (data: any) => api.post('/recipes/submit', data),
    getMySubmissions: (params?: any) => api.get('/recipes/my-submissions', { params }),
    updateSubmission: (id: string, data: any) => api.put(`/recipes/my-submissions/${id}`, data),
    deleteSubmission: (id: string) => api.delete(`/recipes/my-submissions/${id}`),
    resubmitSubmission: (id: string) => api.post(`/recipes/my-submissions/${id}/resubmit`),
    
    // Ratings & Reviews
    getRatings: (recipeId: string, page?: number, limit?: number) =>
        api.get(`/recipes/${recipeId}/ratings`, { params: { page, limit } }),
    createRating: (recipeId: string, data: { rating: number; review?: string }) =>
        api.post(`/recipes/${recipeId}/ratings`, data),
    updateRating: (recipeId: string, ratingId: string, data: { rating: number; review?: string }) =>
        api.put(`/recipes/${recipeId}/ratings/${ratingId}`, data),
    deleteRating: (recipeId: string, ratingId: string) =>
        api.delete(`/recipes/${recipeId}/ratings/${ratingId}`),
    createReply: (recipeId: string, parentId: string, data: { review: string }) =>
        api.post(`/recipes/${recipeId}/ratings/${parentId}/replies`, data),
    getEditHistory: (recipeId: string) => api.get(`/recipes/${recipeId}/edit-history`),
};

// ==================== FAVORITES API ====================
export const favoritesAPI = {
    getAll: (params?: any) => api.get('/favorites', { params }),
    add: (recipeId: string) => api.post('/favorites', { recipeId }),
    remove: (recipeId: string) => api.delete(`/favorites/${recipeId}`),
};

// ==================== ADMIN API ====================
export const adminAPI = {
    // Stats
    getStats: () => api.get('/recipes/admin/stats'),
    // Recipe CRUD
    getAllRecipes: (params?: any) => api.get('/recipes/admin/all', { params }),
    createRecipe: (data: any) => api.post('/recipes/admin/create', data),
    updateRecipe: (id: string, data: any) => api.put(`/recipes/admin/${id}`, data),
    deleteRecipe: (id: string) => api.delete(`/recipes/admin/${id}`),
    // Moderation
    getPending: (params?: any) => api.get('/recipes/admin/pending', { params: { ...params, t: Date.now() }, headers: { 'Cache-Control': 'no-cache' } }),
    approve: (id: string) => api.post(`/recipes/admin/${id}/approve`),
    reject: (id: string, reason: string) => api.post(`/recipes/admin/${id}/reject`, { reason }),
    getAudit: (recipeId: string) => api.get(`/recipes/admin/moderation/${recipeId}/audit`),
    retryAudit: (recipeId: string) => api.post(`/recipes/admin/moderation/${recipeId}/audit/retry`),
    editPending: (id: string, data: any) => api.put(`/recipes/admin/${id}/edit-pending`, data),
};

// ==================== UPLOAD API ====================
export const uploadAPI = {
    uploadImage: (file: File) => {
        const formData = new FormData();
        formData.append('image', file);
        return api.post('/upload/image', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
};

// ==================== INVENTORY API ====================
export const inventoryAPI = {
    getAll: (params?: any) => api.get('/inventory', { params }),
    create: (data: any) => api.post('/inventory', data),
    update: (id: string, data: any) => api.put(`/inventory/${id}`, data),
    remove: (id: string) => api.delete(`/inventory/${id}`),
    searchIngredients: (q: string) =>
        api.get('/inventory/ingredients/search', { params: { q } }),
};

// ==================== RECOMMENDATION API ====================
export const recommendationAPI = {
    get: (params?: any) => api.get('/recommendations', { params }),
    getAntiWaste: () => api.get('/recommendations/anti-waste'),
    getNutritionAnalysis: (weekStart: string) =>
        api.get('/recommendations/nutrition-analysis', { params: { weekStart } }),
    getLatestNutritionAnalysis: () =>
        api.get('/recommendations/nutrition-analysis/latest'),
};

// ==================== MEAL PLAN API ====================
type MealPlanInvalidationOptions = {
    mutation: string;
    weekStart?: string;
    planId?: string;
};

const getObjectValue = (payload: unknown, key: string) =>
    typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)[key]
        : undefined;

const inferMealPlanWeekStart = (payload: unknown) => {
    const mealPlan = getObjectValue(payload, 'mealPlan');
    return normalizeWeekStart(getObjectValue(payload, 'weekStart') || getObjectValue(mealPlan, 'weekStart'));
};

const inferMealPlanId = (payload: unknown) => {
    const id = getObjectValue(payload, 'id') || getObjectValue(payload, 'planId');
    return id ? String(id) : undefined;
};

const invalidateMealPlanAfter = <T extends AxiosResponse<unknown>>(
    request: Promise<T>,
    options: MealPlanInvalidationOptions,
) =>
    request.then((response) => {
        notifyMealPlanChanged({
            source: 'mealPlanAPI',
            mutation: options.mutation,
            weekStart: normalizeWeekStart(options.weekStart) || inferMealPlanWeekStart(response.data),
            planId: options.planId || inferMealPlanId(response.data),
        });
        return response;
    });

export const mealPlanAPI = {
    get: (weekStart?: string) =>
        api.get('/meal-plans', { params: { weekStart } }),
    generate: (data: any) =>
        invalidateMealPlanAfter(api.post('/meal-plans/generate', data), {
            mutation: 'generate',
            weekStart: data?.weekStart,
        }),
    generateForDays: (data: { weekStart?: string; days?: number[]; mealDates?: string[]; targetDate?: string; scope?: 'day' | 'week'; source?: string; healthConditions?: string; tdee?: number; adjustedDailyCalorieTarget?: number; useAntiWaste?: boolean; mealType?: string; mealTypes?: string[]; overwrite?: boolean; optimizePortions?: boolean; options?: { preferNewRecipes?: boolean; avoidRepeatLast7Days?: boolean }; prioritizeNew?: boolean; noRepeatIn7Days?: boolean; avoidRepeatMeals?: boolean; excludeRecipeIds?: string[]; recentSuggestedRecipeIds?: string[]; forceRefresh?: boolean }) =>
        invalidateMealPlanAfter(api.post('/meal-plans/generate-days', data), {
            mutation: 'generate-days',
            weekStart: data.weekStart,
        }),
    setMealSlot: (data: { weekStart?: string; dayOfWeek?: number; mealDate?: string; mealType: string; recipeId?: string; recipeIds?: string[]; overwrite?: boolean; forceAdd?: boolean }) =>
        invalidateMealPlanAfter(api.put('/meal-plans/slot', data), {
            mutation: 'set-slot',
            weekStart: data.weekStart,
        }),
    swapRecipe: (planId: string, itemId: string, recipeId: string, forceAdd?: boolean) =>
        invalidateMealPlanAfter(api.put(`/meal-plans/${planId}/items/${itemId}`, { recipeId, forceAdd }), {
            mutation: 'swap-recipe',
            planId,
        }),
    toggleLock: (planId: string, itemId: string, isLocked: boolean) =>
        api.patch(`/meal-plans/${planId}/items/${itemId}/lock`, { isLocked }),
    toggleConsume: (planId: string, itemId: string, isConsumed: boolean) =>
        api.patch(`/meal-plans/${planId}/items/${itemId}/consume`, { isConsumed }),
    delete: (planId: string) =>
        invalidateMealPlanAfter(api.delete(`/meal-plans/${planId}`), {
            mutation: 'delete-plan',
            planId,
        }),
    removeItem: (planId: string, itemId: string) =>
        invalidateMealPlanAfter(api.delete(`/meal-plans/${planId}/items/${itemId}`), {
            mutation: 'remove-item',
            planId,
        }),
    getNutrition: (planId: string) =>
        api.get(`/meal-plans/${planId}/nutrition`),
};

// ==================== SHOPPING LIST API ====================
export const shoppingListAPI = {
    getAll: () => api.get('/shopping-lists'),
    getById: (id: string) => api.get(`/shopping-lists/${id}`),
    generate: (mealPlanId: string, days?: number[]) =>
        api.post('/shopping-lists/generate', { mealPlanId, days }),
    addRecipeToList: (recipeId: string) => api.post('/shopping-lists/add-recipe', { recipeId }),
    markPurchased: (listId: string, itemId: string, isPurchased: boolean) =>
        api.patch(`/shopping-lists/${listId}/items/${itemId}`, { isPurchased }),
    delete: (id: string) => api.delete(`/shopping-lists/${id}`),
};

// ==================== CHATBOT API ====================
export const chatbotAPI = {
    sendMessage: (message: string) => api.post('/chatbot/message', { message }),
    getHistory: () => api.get('/chatbot/history'),
    clearHistory: () => api.delete('/chatbot/history'),
    logAction: (data: {
        actionType: 'accept' | 'reject' | 'view_detail';
        recipeId?: string;
        mealType?: string;
        reason?: string;
        calories?: number;
        cookingTime?: number;
    }) => api.post('/chatbot/action-log', data),
};

// ==================== ADMIN MODERATION API ====================
export const adminModerationAPI = {
    getFlaggedReviews: () => api.get('/admin/reviews/flagged'),
    deleteFlaggedReview: (reviewId: string) => api.delete(`/admin/reviews/${reviewId}`),
    ignoreFlaggedReview: (reviewId: string) => api.patch(`/admin/reviews/${reviewId}/ignore`),
    getNotifications: () => api.get('/admin/moderation/notifications'),
    markNotificationAsRead: (id: string) => api.patch(`/admin/moderation/notifications/${id}/read`),
    approveReview: (reviewId: string) => api.post(`/admin/moderation/reviews/${reviewId}/approve`),
    rejectReview: (reviewId: string) => api.post(`/admin/moderation/reviews/${reviewId}/reject`),
    unlockUser: (userId: string) => api.patch(`/admin/moderation/users/${userId}/unlock`),
};

// ==================== NOTIFICATIONS API ====================
export const notificationsAPI = {
    getAll: (params?: any) => api.get('/notifications', { params }),
    getUnreadCount: () => api.get('/notifications/unread-count'),
    markAsRead: (id: string) => api.put(`/notifications/${id}/read`),
    markAllAsRead: () => api.put('/notifications/mark-all-read'),
};

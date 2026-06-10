import axios from 'axios';

// Create axios instance configured for our NestJS backend
const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
    headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach JWT token to every request
api.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('accessToken');
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

// ==================== AUTH API ====================
export const authAPI = {
    register: (data: { email: string; password: string; fullName: string }) =>
        api.post('/auth/register', data),
    login: (data: { email: string; password: string }) =>
        api.post('/auth/login', data),
    getProfile: () => api.get('/auth/profile'),
    updateProfile: (data: any) => api.put('/auth/profile', data),
    getProfileStats: () => api.get('/auth/profile/stats'),
    adminListAllUsers: () => api.get('/auth/admin/users'),
    adminCreateUser: (data: any) => api.post('/auth/admin/users', data),
    adminUpdateUser: (id: string, data: any) => api.put(`/auth/admin/users/${id}`, data),
    adminDeleteUser: (id: string) => api.delete(`/auth/admin/users/${id}`),
    
    // Password Reset
    forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
    resetPassword: (data: any) => api.post('/auth/reset-password', data),
};

// ==================== RECIPES API ====================
export const recipesAPI = {
    getAll: (params?: any) => api.get('/recipes', { params }),
    getById: (id: string) => api.get(`/recipes/${id}`),
    toggleFavorite: (id: string) => api.post(`/recipes/${id}/favorite`),
    getFavorites: (params?: any) => api.get('/recipes/favorites', { params }),
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
    getPending: (params?: any) => api.get('/recipes/admin/pending', { params }),
    approve: (id: string) => api.post(`/recipes/admin/${id}/approve`),
    reject: (id: string, reason: string) => api.post(`/recipes/admin/${id}/reject`, { reason }),
    getAudit: (recipeId: string) => api.get(`/recipes/admin/moderation/${recipeId}/audit`),
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
export const mealPlanAPI = {
    get: (weekStart?: string) =>
        api.get('/meal-plans', { params: { weekStart } }),
    generate: (data: any) => api.post('/meal-plans/generate', data),
    generateForDays: (data: { weekStart?: string; days?: number[]; mealDates?: string[]; useAntiWaste?: boolean; overwrite?: boolean }) =>
        api.post('/meal-plans/generate-days', data),
    setMealSlot: (data: { weekStart?: string; dayOfWeek?: number; mealDate?: string; mealType: string; recipeId: string; overwrite?: boolean }) =>
        api.put('/meal-plans/slot', data),
    swapRecipe: (planId: string, itemId: string, recipeId: string) =>
        api.put(`/meal-plans/${planId}/items/${itemId}`, { recipeId }),
    toggleLock: (planId: string, itemId: string, isLocked: boolean) =>
        api.patch(`/meal-plans/${planId}/items/${itemId}/lock`, { isLocked }),
    toggleConsume: (planId: string, itemId: string, isConsumed: boolean) =>
        api.patch(`/meal-plans/${planId}/items/${itemId}/consume`, { isConsumed }),
    delete: (planId: string) => api.delete(`/meal-plans/${planId}`),
    removeItem: (planId: string, itemId: string) =>
        api.delete(`/meal-plans/${planId}/items/${itemId}`),
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
    sendVoiceMessage: (message: string, durationMs: number) => api.post('/chatbot/voice', { message, durationMs }),
    getVoiceStats: () => api.get('/chatbot/voice/stats'),
    getHistory: () => api.get('/chatbot/history'),
    clearHistory: () => api.delete('/chatbot/history'),
    getTtsAudio: (text: string) => api.get('/chatbot/tts', { params: { text }, responseType: 'blob' }),
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

'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiCheckCircle,
  HiClock,
  HiEye,
  HiFire,
  HiPencil,
  HiPlus,
  HiTrash,
  HiUpload,
  HiUser,
  HiXCircle,
} from 'react-icons/hi';
import { adminAPI, uploadAPI } from '@/lib/api';

type EditIngredient = {
  name: string;
  quantity: number;
  unit: string;
  isOptional?: boolean;
};

type EditStep = {
  step: number;
  description: string;
};

const emptyEditForm = {
  name: '',
  description: '',
  cookingTime: 0,
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  imageUrl: '',
  ingredients: [] as EditIngredient[],
  steps: [] as EditStep[],
};

const normalizeSteps = (rawSteps: any): EditStep[] => {
  if (!Array.isArray(rawSteps)) return [];

  return rawSteps
    .map((step, index) => {
      if (typeof step === 'string') {
        const description = step.trim();
        return description
          ? { step: index + 1, description }
          : null;
      }

      if (!step || typeof step !== 'object') return null;

      const preferred = [
        step.description,
        step.content,
        step.text,
        step.instruction,
        step.value,
      ]
        .map((value: unknown) => String(value ?? '').trim())
        .find((value) => value && !/^\d+$/.test(value));

      const fallback = Object.values(step)
        .map((value) => String(value ?? '').trim())
        .find((value) => value && !/^\d+$/.test(value));

      const numericFallback = [
        step.description,
        step.content,
        step.text,
        step.instruction,
        step.value,
      ]
        .map((value: unknown) => String(value ?? '').trim())
        .find((value) => value);

      const description = preferred || fallback || numericFallback || '';
      if (!description) return null;

      return {
        step: Number(step.step || index + 1),
        description,
      };
    })
    .filter(Boolean) as EditStep[];
};

const getApiErrorMessage = (err: any, fallback: string) => {
  const apiMessage = err?.response?.data?.message;
  return Array.isArray(apiMessage) ? apiMessage.join(', ') : apiMessage || fallback;
};

const formatAuditFeedback = (audit: any) => {
  if (!audit) {
    return {
      scoreLabel: 'N/A',
      nutritionNote: 'Chưa có dữ liệu audit.',
      detail: 'Chưa có dữ liệu audit.',
    };
  }

  const rawFeedback = String(audit.rawAIFeedback || '');
  if (
    audit.aiEvaluationFailed &&
    (rawFeedback.includes('503 Service Unavailable') ||
      rawFeedback.includes('high demand') ||
      rawFeedback.includes('GoogleGenerativeAIError'))
  ) {
    return {
      scoreLabel: 'N/A',
      nutritionNote: 'Dịch vụ AI đang bận nên tạm thời chưa thể đánh giá công thức lúc này.',
      detail:
        'Đây là lỗi tạm thời từ Gemini, không phải lỗi dữ liệu công thức. Bạn có thể bấm "Thử lại AI Review" sau ít phút.',
    };
  }

  if (audit.aiEvaluationFailed) {
    return {
      scoreLabel: 'N/A',
      nutritionNote: audit.nutritionValidityNotes || 'AI tạm thời chưa đánh giá được công thức.',
      detail: rawFeedback || 'AI tạm thời chưa đánh giá được công thức.',
    };
  }

  return {
    scoreLabel: audit.qualityScore === -1 ? 'N/A' : `${audit.qualityScore}/100`,
    nutritionNote: audit.nutritionValidityNotes || 'Không có ghi chú thêm.',
    detail: rawFeedback || 'Không có nhận xét thêm.',
  };
};

export default function AdminPendingPage() {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [viewRecipe, setViewRecipe] = useState<any>(null);
  const [editingRecipe, setEditingRecipe] = useState<any | null>(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [uploading, setUploading] = useState(false);
  const [auditData, setAuditData] = useState<Record<string, any>>({});
  const [loadingAudit, setLoadingAudit] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadPending();
  }, []);

  const loadPending = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getPending();
      setRecipes(res.data.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Không tải được danh sách chờ duyệt');
    } finally {
      setLoading(false);
    }
  };

  const fetchAudit = async (recipeId: string) => {
    setLoadingAudit((prev) => ({ ...prev, [recipeId]: true }));
    try {
      const res = await adminAPI.getAudit(recipeId);
      setAuditData((prev) => ({ ...prev, [recipeId]: res.data }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAudit((prev) => ({ ...prev, [recipeId]: false }));
    }
  };

  const handleRetryAudit = async (recipeId: string) => {
    setLoadingAudit((prev) => ({ ...prev, [recipeId]: true }));
    try {
      const res = await adminAPI.retryAudit(recipeId);
      setAuditData((prev) => ({ ...prev, [recipeId]: res.data }));
      toast.success('Đã chạy lại AI audit');
    } catch (err) {
      console.error(err);
      toast.error('Thử lại AI audit thất bại');
    } finally {
      setLoadingAudit((prev) => ({ ...prev, [recipeId]: false }));
    }
  };

  const toggleViewRecipe = async (recipe: any) => {
    if (viewRecipe?.id === recipe.id) {
      setViewRecipe(null);
      return;
    }
    setViewRecipe(recipe);
    if (!auditData[recipe.id]) {
      await fetchAudit(recipe.id);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await adminAPI.approve(id);
      toast.success('Đã duyệt công thức');
      loadPending();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Lỗi khi duyệt'));
    }
  };

  const handleReject = async () => {
    if (!rejectingId || !rejectReason.trim()) return;
    try {
      await adminAPI.reject(rejectingId, rejectReason.trim());
      toast.success('Đã từ chối công thức');
      setRejectingId(null);
      setRejectReason('');
      loadPending();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Lỗi khi từ chối'));
    }
  };

  const handleEditClick = (recipe: any) => {
    const normalizedSteps = normalizeSteps(recipe.steps);
    setEditingRecipe(recipe);
    setEditForm({
      name: recipe.name || '',
      description: recipe.description || '',
      cookingTime: Number(recipe.cookingTime || 0),
      calories: Number(recipe.calories || 0),
      protein: Number(recipe.protein || 0),
      carbs: Number(recipe.carbs || 0),
      fat: Number(recipe.fat || 0),
      imageUrl: recipe.imageUrl || '',
      ingredients:
        recipe.recipeIngredients?.map((ri: any) => ({
          name: ri.ingredient?.name || '',
          quantity: Number(ri.quantity || 0),
          unit: ri.unit || '',
          isOptional: !!ri.isOptional,
        })) || [],
      steps: normalizedSteps.length > 0 ? normalizedSteps : [{ step: 1, description: '' }],
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadAPI.uploadImage(file);
      setEditForm((prev) => ({ ...prev, imageUrl: res.data.url }));
      toast.success('Tải ảnh lên thành công');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Tải ảnh lên thất bại'));
    } finally {
      setUploading(false);
    }
  };

  const addIngredient = () => {
    setEditForm((prev) => ({
      ...prev,
      ingredients: [...prev.ingredients, { name: '', quantity: 0, unit: 'g', isOptional: false }],
    }));
  };

  const removeIngredient = (idx: number) => {
    setEditForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, index) => index !== idx),
    }));
  };

  const updateIngredient = (
    idx: number,
    field: keyof EditIngredient,
    value: string | number | boolean,
  ) => {
    setEditForm((prev) => {
      const next = [...prev.ingredients];
      next[idx] = { ...next[idx], [field]: value };
      return { ...prev, ingredients: next };
    });
  };

  const addStep = () => {
    setEditForm((prev) => ({
      ...prev,
      steps: [...prev.steps, { step: prev.steps.length + 1, description: '' }],
    }));
  };

  const removeStep = (idx: number) => {
    setEditForm((prev) => {
      const filtered = prev.steps.filter((_, index) => index !== idx);
      return {
        ...prev,
        steps: filtered.map((step, index) => ({ ...step, step: index + 1 })),
      };
    });
  };

  const updateStep = (idx: number, description: string) => {
    setEditForm((prev) => {
      const next = [...prev.steps];
      next[idx] = { ...next[idx], description };
      return { ...prev, steps: next };
    });
  };

  const handleSaveEdit = async () => {
    if (!editingRecipe) return;
    const fallbackSteps = normalizeSteps(editingRecipe.steps);

    const payload = {
      ...editForm,
      name: editForm.name.trim(),
      description: editForm.description.trim(),
      imageUrl: editForm.imageUrl.trim(),
      cookingTime: Number(editForm.cookingTime || 0),
      calories: Number(editForm.calories || 0),
      protein: Number(editForm.protein || 0),
      carbs: Number(editForm.carbs || 0),
      fat: Number(editForm.fat || 0),
      ingredients: editForm.ingredients
        .filter((ing) => ing.name.trim() && ing.unit.trim())
        .map((ing) => ({
          ...ing,
          name: ing.name.trim(),
          unit: ing.unit.trim(),
          quantity: Number(ing.quantity || 0),
        })),
      steps: (
        editForm.steps.filter((step) => step.description.trim()).length > 0
          ? editForm.steps
          : fallbackSteps
      )
        .filter((step) => step.description.trim())
        .map((step, index) => ({
          step: index + 1,
          description: step.description.trim(),
        })),
    };

    if (!payload.name) {
      toast.error('Tên món không được để trống');
      return;
    }
    if (payload.cookingTime < 1) {
      toast.error('Thời gian nấu phải lớn hơn 0');
      return;
    }
    if (payload.calories < 0) {
      toast.error('Calories không hợp lệ');
      return;
    }
    if (payload.steps.length === 0) {
      toast.error('Cần ít nhất 1 bước thực hiện');
      return;
    }

    try {
      await adminAPI.editPending(editingRecipe.id, payload);
      toast.success('Đã lưu chỉnh sửa thành công');
      setEditingRecipe(null);
      setEditForm(emptyEditForm);
      setAuditData((prev) => {
        const next = { ...prev };
        delete next[editingRecipe.id];
        return next;
      });
      loadPending();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Lỗi khi lưu chỉnh sửa'));
    }
  };

  const viewedSteps = useMemo(
    () => (viewRecipe ? normalizeSteps(viewRecipe.steps) : []),
    [viewRecipe],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Bài đăng chờ duyệt</h1>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 bg-white rounded-2xl border border-gray-200 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bài đăng chờ duyệt</h1>
        <p className="text-gray-500 mt-1">
          {recipes.length > 0
            ? `${recipes.length} bài đang chờ xem xét`
            : 'Không có bài nào chờ duyệt'}
        </p>
      </div>

      {recipes.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <p className="text-5xl mb-4">✅</p>
          <p className="text-lg font-medium text-gray-700">Tất cả đã được xử lý</p>
          <p className="text-gray-500 mt-1">Không có bài đăng nào chờ duyệt</p>
        </div>
      ) : (
        <div className="space-y-4">
          {recipes.map((recipe) => {
            const displaySteps = normalizeSteps(recipe.steps);
            const feedback = formatAuditFeedback(auditData[recipe.id]);

            return (
              <div
                key={recipe.id}
                className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-sm transition-shadow"
              >
                <div className="flex flex-col lg:flex-row items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-gray-900">{recipe.name}</h3>
                      {recipe.hasBeenEditedByAdmin && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                          Đã chỉnh sửa bởi Admin
                        </span>
                      )}
                    </div>

                    {recipe.description && (
                      <p className="text-gray-500 mt-1 text-sm line-clamp-2">
                        {recipe.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <HiUser className="text-purple-500" /> {recipe.submitterName}
                      </span>
                      <span className="flex items-center gap-1">
                        <HiClock /> {recipe.cookingTime}p
                      </span>
                      <span className="flex items-center gap-1">
                        <HiFire /> {recipe.calories} kcal
                      </span>
                    </div>

                    {displaySteps.length > 0 && (
                      <div className="mt-3">
                        <button
                          onClick={() => toggleViewRecipe(recipe)}
                          className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 font-medium cursor-pointer"
                        >
                          <HiEye />{' '}
                          {viewRecipe?.id === recipe.id
                            ? 'Ẩn chi tiết & AI Audit'
                            : 'Xem chi tiết & AI Audit'}
                        </button>

                        {viewRecipe?.id === recipe.id && (
                          <div className="mt-4 space-y-4">
                            <div className="pl-4 border-l-2 border-purple-200 space-y-1">
                              {viewedSteps.map((step, index) => (
                                <p key={index} className="text-sm text-gray-600">
                                  <span className="font-medium text-purple-600">
                                    Bước {step.step}:
                                  </span>{' '}
                                  {step.description}
                                </p>
                              ))}
                            </div>

                            {loadingAudit[recipe.id] ? (
                              <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100/50 animate-pulse text-xs text-emerald-800 font-medium">
                                Trợ lý AI đang thẩm định công thức...
                              </div>
                            ) : auditData[recipe.id] ? (
                              <div className="p-4 bg-emerald-50/30 rounded-2xl border border-emerald-100/50 space-y-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-xs font-bold text-emerald-700">
                                    Đánh giá kiểm duyệt từ AI
                                  </h4>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleRetryAudit(recipe.id)}
                                      className="px-2 py-0.5 bg-amber-100 text-amber-800 hover:bg-amber-200 transition rounded-full text-[10px] font-bold border-none cursor-pointer"
                                    >
                                      Thử lại AI Review
                                    </button>
                                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                                      AI Score: {feedback.scoreLabel}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-xs text-gray-700 space-y-1">
                                  <div>
                                    <span className="font-bold text-gray-500">
                                      Đo lường Calo:
                                    </span>{' '}
                                    {feedback.nutritionNote}
                                  </div>
                                  <div>
                                    <span className="font-bold text-gray-500">
                                      Nhận xét chi tiết:
                                    </span>{' '}
                                    {feedback.detail}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:justify-end mt-4 lg:mt-0 pt-4 lg:pt-0 border-t lg:border-t-0 border-gray-100">
                    <button
                      onClick={() => handleEditClick(recipe)}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-100 transition cursor-pointer"
                    >
                      <HiPencil className="text-base" /> Sửa bài viết
                    </button>
                    <button
                      onClick={() => handleApprove(recipe.id)}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-medium hover:bg-emerald-100 transition cursor-pointer"
                    >
                      <HiCheckCircle className="text-lg" /> Duyệt
                    </button>
                    <button
                      onClick={() => {
                        setRejectingId(recipe.id);
                        setRejectReason('');
                      }}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-red-50 text-red-700 rounded-xl text-sm font-medium hover:bg-red-100 transition cursor-pointer"
                    >
                      <HiXCircle className="text-lg" /> Từ chối
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rejectingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm"
          onClick={() => setRejectingId(null)}
        >
          <div
            className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md mx-4 max-h-[90vh] flex flex-col overflow-y-auto shadow-xl border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Từ chối công thức</h3>
            <p className="text-sm text-gray-500 mb-4">
              Vui lòng nhập lý do từ chối để người dùng biết
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="VD: Công thức chưa đủ chi tiết..."
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 outline-none resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setRejectingId(null)}
                className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition cursor-pointer font-bold"
              >
                Hủy
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition disabled:opacity-50 cursor-pointer font-bold"
              >
                Xác nhận từ chối
              </button>
            </div>
          </div>
        </div>
      )}

      {editingRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-4 sm:p-6 shadow-2xl border border-gray-200 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b pb-4 flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Sửa bài viết trước khi duyệt</h3>
              <button
                onClick={() => setEditingRecipe(null)}
                className="text-gray-400 hover:text-gray-700 text-xl font-bold border-none bg-transparent cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 my-4 pr-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 uppercase">Tên món</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 uppercase">Mô tả</label>
                  <input
                    type="text"
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 uppercase">
                    Thời gian nấu
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editForm.cookingTime}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        cookingTime: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 uppercase">Calories</label>
                  <input
                    type="number"
                    value={editForm.calories}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, calories: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 uppercase">Protein</label>
                  <input
                    type="number"
                    value={editForm.protein}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, protein: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 uppercase">Carbs</label>
                  <input
                    type="number"
                    value={editForm.carbs}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, carbs: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 uppercase">Fat</label>
                  <input
                    type="number"
                    value={editForm.fat}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, fat: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-600 uppercase block">
                  Ảnh món ăn
                </label>
                <div className="flex items-center gap-4">
                  {editForm.imageUrl && (
                    <img
                      src={editForm.imageUrl}
                      alt="preview"
                      className="w-16 h-16 rounded-lg object-cover border"
                    />
                  )}
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      placeholder="URL ảnh hoặc tải ảnh lên"
                      value={editForm.imageUrl}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, imageUrl: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    />
                    <label className="flex w-fit items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg cursor-pointer transition">
                      <HiUpload className="text-sm" />
                      <span>{uploading ? 'Đang tải lên...' : 'Tải tệp lên'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={uploading}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between border-t pt-4">
                  <h4 className="text-sm font-bold text-gray-800">Nguyên liệu</h4>
                  <button
                    onClick={addIngredient}
                    className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 border-none bg-transparent cursor-pointer"
                  >
                    <HiPlus /> Thêm nguyên liệu
                  </button>
                </div>
                <div className="space-y-2">
                  {editForm.ingredients.map((ing, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <input
                          type="text"
                          placeholder="Tên nguyên liệu"
                          value={ing.name}
                          onChange={(e) => updateIngredient(i, 'name', e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          placeholder="Số lượng"
                          value={ing.quantity || ''}
                          onChange={(e) =>
                            updateIngredient(i, 'quantity', Number(e.target.value))
                          }
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="text"
                          placeholder="Đơn vị"
                          value={ing.unit}
                          onChange={(e) => updateIngredient(i, 'unit', e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
                        />
                      </div>
                      <div className="col-span-1 text-center">
                        <input
                          type="checkbox"
                          checked={ing.isOptional || false}
                          onChange={(e) =>
                            updateIngredient(i, 'isOptional', e.target.checked)
                          }
                          className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                        />
                      </div>
                      <div className="col-span-1 text-right">
                        <button
                          onClick={() => removeIngredient(i)}
                          className="text-red-500 hover:text-red-700 text-sm border-none bg-transparent cursor-pointer"
                          title="Xóa"
                        >
                          <HiTrash />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-gray-800">Các bước thực hiện</h4>
                  <button
                    onClick={addStep}
                    className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 border-none bg-transparent cursor-pointer"
                  >
                    <HiPlus /> Thêm bước
                  </button>
                </div>
                <div className="space-y-3">
                  {editForm.steps.map((step, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="text-xs font-bold text-gray-500 w-16 pt-2 shrink-0">
                        Bước {step.step}:
                      </span>
                      <textarea
                        value={step.description}
                        onChange={(e) => updateStep(i, e.target.value)}
                        rows={2}
                        placeholder="Mô tả công đoạn nấu..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs resize-none"
                      />
                      <button
                        onClick={() => removeStep(i)}
                        className="text-red-500 hover:text-red-700 text-base pt-2 border-none bg-transparent cursor-pointer"
                        title="Xóa bước này"
                      >
                        <HiTrash />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t pt-4 flex-shrink-0">
              <button
                onClick={() => setEditingRecipe(null)}
                className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition cursor-pointer text-xs font-bold"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editForm.name.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer text-xs font-bold"
              >
                Lưu chỉnh sửa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

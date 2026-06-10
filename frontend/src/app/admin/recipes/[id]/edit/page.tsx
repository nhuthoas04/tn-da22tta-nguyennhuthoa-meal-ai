'use client';
import { useState, useEffect, use } from 'react';
import { adminAPI, recipesAPI } from '@/lib/api';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { HiArrowLeft, HiPlus, HiTrash } from 'react-icons/hi';
import Link from 'next/link';
import ImageUpload from '@/components/ImageUpload';

export default function AdminEditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [form, setForm] = useState({
    name: '',
    description: '',
    imageUrl: '',
    cookingTime: 30,
    servings: 4,
    difficulty: 'easy',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    tags: '',
    mealType: [] as string[],
    cuisineRegion: '',
    estimatedCost: 0,
  });
  const [steps, setSteps] = useState([{ step: 1, description: '' }]);
  const [ingredients, setIngredients] = useState([{ name: '', quantity: 0, unit: 'g' }]);

  useEffect(() => {
    loadRecipe();
  }, []);

  const loadRecipe = async () => {
    try {
      const res = await recipesAPI.getById(id);
      const r = res.data;
      setForm({
        name: r.name || '',
        description: r.description || '',
        imageUrl: r.imageUrl || '',
        cookingTime: r.cookingTime || 30,
        servings: r.servings || 4,
        difficulty: r.difficulty || 'easy',
        calories: r.calories || 0,
        protein: r.protein || 0,
        carbs: r.carbs || 0,
        fat: r.fat || 0,
        tags: r.tags?.join(', ') || '',
        mealType: r.mealType || [],
        cuisineRegion: r.cuisineRegion || '',
        estimatedCost: r.estimatedCost || 0,
      });
      setSteps(r.steps?.length ? r.steps : [{ step: 1, description: '' }]);
      setIngredients(
        r.ingredients?.length
          ? r.ingredients.map((i: any) => ({ name: i.name, quantity: i.quantity, unit: i.unit }))
          : [{ name: '', quantity: 0, unit: 'g' }]
      );
    } catch (err) {
      toast.error('Không tìm thấy công thức');
      router.push('/admin/recipes');
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = {
        ...form,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()) : [],
        steps: steps.filter((s) => s.description.trim()),
        ingredients: ingredients.filter((i) => i.name.trim()),
      };
      await adminAPI.updateRecipe(id, data);
      toast.success('Cập nhật thành công!');
      router.push('/admin/recipes');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi cập nhật');
    } finally {
      setLoading(false);
    }
  };

  const addStep = () => setSteps([...steps, { step: steps.length + 1, description: '' }]);
  const removeStep = (i: number) => setSteps(steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step: idx + 1 })));
  const addIngredient = () => setIngredients([...ingredients, { name: '', quantity: 0, unit: 'g' }]);
  const removeIngredient = (i: number) => setIngredients(ingredients.filter((_, idx) => idx !== i));
  const toggleMealType = (type: string) => {
    setForm((prev) => ({
      ...prev,
      mealType: prev.mealType.includes(type) ? prev.mealType.filter((t) => t !== type) : [...prev.mealType, type],
    }));
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/recipes" className="p-2 hover:bg-gray-100 rounded-lg transition">
          <HiArrowLeft className="text-xl text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chỉnh sửa công thức</h1>
          <p className="text-gray-500 mt-1">{form.name}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Thông tin cơ bản</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên công thức *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none resize-none" />
          </div>
          {/* Image Upload */}
          <ImageUpload
            value={form.imageUrl}
            onChange={(url) => setForm({ ...form, imageUrl: url })}
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Thời gian (phút)</label>
              <input type="number" value={form.cookingTime} onChange={(e) => setForm({ ...form, cookingTime: +e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none" min={1} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Khẩu phần</label>
              <input type="number" value={form.servings} onChange={(e) => setForm({ ...form, servings: +e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none" min={1} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Độ khó</label>
              <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none">
                <option value="easy">Dễ</option>
                <option value="medium">Trung bình</option>
                <option value="hard">Khó</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Giá ước tính (₫)</label>
              <input type="number" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: +e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vùng miền</label>
            <select value={form.cuisineRegion} onChange={(e) => setForm({ ...form, cuisineRegion: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none">
              <option value="">Không xác định</option>
              <option value="miền Bắc">Miền Bắc</option>
              <option value="miền Trung">Miền Trung</option>
              <option value="miền Nam">Miền Nam</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Bữa ăn</label>
            <div className="flex gap-2">
              {[{ value: 'breakfast', label: 'Bữa sáng' }, { value: 'lunch', label: 'Bữa trưa' }, { value: 'dinner', label: 'Bữa tối' }].map((mt) => (
                <button key={mt.value} type="button" onClick={() => toggleMealType(mt.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${form.mealType.includes(mt.value) ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {mt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
            <input type="text" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="VD: nhanh, chay"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none" />
          </div>
        </div>

        {/* Nutrition */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Dinh dưỡng</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { key: 'calories', label: 'Calories (kcal)' },
              { key: 'protein', label: 'Protein (g)' },
              { key: 'carbs', label: 'Carbs (g)' },
              { key: 'fat', label: 'Fat (g)' },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                <input type="number" value={(form as any)[f.key]} onChange={(e) => setForm({ ...form, [f.key]: +e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none" />
              </div>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Các bước</h2>
            <button type="button" onClick={addStep} className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 font-medium">
              <HiPlus /> Thêm bước
            </button>
          </div>
          {steps.map((step, index) => (
            <div key={index} className="flex gap-3 items-start">
              <span className="w-8 h-8 bg-purple-100 text-purple-700 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 mt-1">{step.step}</span>
              <textarea value={step.description} onChange={(e) => { const s = [...steps]; s[index].description = e.target.value; setSteps(s); }} rows={2}
                placeholder={`Bước ${step.step}...`} className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none resize-none text-sm" />
              {steps.length > 1 && <button type="button" onClick={() => removeStep(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><HiTrash /></button>}
            </div>
          ))}
        </div>

        {/* Ingredients */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Nguyên liệu</h2>
            <button type="button" onClick={addIngredient} className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 font-medium">
              <HiPlus /> Thêm
            </button>
          </div>
          {ingredients.map((ing, index) => (
            <div key={index} className="flex gap-3 items-center">
              <input type="text" value={ing.name} onChange={(e) => { const a = [...ingredients]; a[index].name = e.target.value; setIngredients(a); }}
                placeholder="Tên" className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
              <input type="number" value={ing.quantity} onChange={(e) => { const a = [...ingredients]; a[index].quantity = +e.target.value; setIngredients(a); }}
                className="w-24 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
              <input type="text" value={ing.unit} onChange={(e) => { const a = [...ingredients]; a[index].unit = e.target.value; setIngredients(a); }}
                className="w-20 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
              {ingredients.length > 1 && <button type="button" onClick={() => removeIngredient(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><HiTrash /></button>}
            </div>
          ))}
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Link href="/admin/recipes" className="px-6 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition">Hủy</Link>
          <button type="submit" disabled={loading} className="px-8 py-2.5 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition disabled:opacity-50">
            {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </div>
  );
}

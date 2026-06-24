'use client';
import { useState } from 'react';
import { recipesAPI } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { HiArrowLeft, HiPlus, HiTrash, HiCheckCircle } from 'react-icons/hi';
import Link from 'next/link';
import ImageUpload from '@/components/ImageUpload';

export default function SubmitRecipePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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

  if (!user) {
    return (
      <div className="text-center py-16">
        <p className="text-4xl mb-3">🔐</p>
        <p className="text-gray-500 mb-4">Bạn cần đăng nhập để chia sẻ công thức</p>
        <Link href="/login" className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition">
          Đăng nhập
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="text-center py-16 space-y-4">
        <HiCheckCircle className="text-6xl text-emerald-500 mx-auto" />
        <h2 className="text-2xl font-bold text-gray-900">Gửi thành công!</h2>
        <p className="text-gray-500 max-w-md mx-auto">
          Công thức của bạn đã được gửi và đang chờ Admin duyệt.
          Bạn sẽ nhận được thông báo khi bài viết được phê duyệt.
        </p>
        <div className="flex justify-center gap-3 mt-6">
          <button
            onClick={() => { setSubmitted(false); setForm({ name: '', description: '', imageUrl: '', cookingTime: 30, servings: 4, difficulty: 'easy', calories: 0, protein: 0, carbs: 0, fat: 0, tags: '', mealType: [], cuisineRegion: '', estimatedCost: 0 }); setSteps([{ step: 1, description: '' }]); setIngredients([{ name: '', quantity: 0, unit: 'g' }]); }}
            className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition"
          >
            Gửi bài khác
          </button>
          <Link href="/recipes" className="px-6 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition">
            Xem công thức
          </Link>
        </div>
      </div>
    );
  }

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
      await recipesAPI.submit(data);
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi gửi');
    } finally {
      setLoading(false);
    }
  };

  const addStep = () => setSteps([...steps, { step: steps.length + 1, description: '' }]);
  const removeStep = (i: number) => setSteps(steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step: idx + 1 })));
  const addIngredient = () => setIngredients([...ingredients, { name: '', quantity: 0, unit: 'g' }]);
  const removeIngredient = (i: number) => setIngredients(ingredients.filter((_, idx) => idx !== i));
  const toggleMealType = (type: string) => {
    setForm((prev) => ({ ...prev, mealType: prev.mealType.includes(type) ? prev.mealType.filter((t) => t !== type) : [...prev.mealType, type] }));
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/recipes" className="p-2 hover:bg-gray-100 rounded-lg transition">
          <HiArrowLeft className="text-xl text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chia sẻ công thức 📝</h1>
          <p className="text-gray-500 mt-1">Chia sẻ công thức yêu thích của bạn với cộng đồng</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
        💡 Công thức sẽ được Admin xem xét và duyệt trước khi hiển thị trên trang web.
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Thông tin công thức</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên món ăn *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="VD: Phở bò Hà Nội" className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả ngắn</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
              placeholder="Mô tả ngắn gọn về món ăn..." className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none resize-none" />
          </div>
          {/* Image Upload */}
          <ImageUpload
            value={form.imageUrl}
            onChange={(url) => setForm({ ...form, imageUrl: url })}
            label="Ảnh món ăn"
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Thời gian nấu (phút) *</label>
              <input type="number" value={form.cookingTime} onChange={(e) => setForm({ ...form, cookingTime: +e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" min={1} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Khẩu phần</label>
              <input type="number" value={form.servings} onChange={(e) => setForm({ ...form, servings: +e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" min={1} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Độ khó</label>
              <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none">
                <option value="easy">Dễ</option>
                <option value="medium">Trung bình</option>
                <option value="hard">Khó</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Giá ước tính (₫)</label>
              <input type="number" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: +e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" min={0} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vùng miền</label>
            <select value={form.cuisineRegion} onChange={(e) => setForm({ ...form, cuisineRegion: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none">
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
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${form.mealType.includes(mt.value) ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {mt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags (phân cách bằng dấu phẩy)</label>
            <input type="text" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="VD: nhanh, chay, miền Nam" className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>
        </div>

        {/* Nutrition */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Dinh dưỡng (mỗi phần)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Calories (kcal) *</label>
              <input type="number" value={form.calories} onChange={(e) => setForm({ ...form, calories: +e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Protein (g)</label>
              <input type="number" value={form.protein} onChange={(e) => setForm({ ...form, protein: +e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Carbs (g)</label>
              <input type="number" value={form.carbs} onChange={(e) => setForm({ ...form, carbs: +e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fat (g)</label>
              <input type="number" value={form.fat} onChange={(e) => setForm({ ...form, fat: +e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Cách làm *</h2>
            <button type="button" onClick={addStep} className="flex items-center gap-1 text-sm text-emerald-600 font-medium">
              <HiPlus /> Thêm bước
            </button>
          </div>
          {steps.map((step, index) => (
            <div key={index} className="flex gap-3 items-start">
              <span className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 mt-1">{step.step}</span>
              <textarea value={step.description} onChange={(e) => { const s = [...steps]; s[index].description = e.target.value; setSteps(s); }} rows={2}
                placeholder={`Bước ${step.step}: mô tả cách làm...`} className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none resize-none text-sm" />
              {steps.length > 1 && <button type="button" onClick={() => removeStep(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><HiTrash /></button>}
            </div>
          ))}
        </div>

        {/* Ingredients */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Nguyên liệu</h2>
            <button type="button" onClick={addIngredient} className="flex items-center gap-1 text-sm text-emerald-600 font-medium">
              <HiPlus /> Thêm
            </button>
          </div>
          {ingredients.map((ing, index) => (
            <div key={index} className="flex gap-3 items-center">
              <input type="text" value={ing.name} onChange={(e) => { const a = [...ingredients]; a[index].name = e.target.value; setIngredients(a); }}
                placeholder="Tên nguyên liệu" className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              <input type="number" value={ing.quantity} onChange={(e) => { const a = [...ingredients]; a[index].quantity = +e.target.value; setIngredients(a); }}
                placeholder="SL" className="w-24 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              <input type="text" value={ing.unit} onChange={(e) => { const a = [...ingredients]; a[index].unit = e.target.value; setIngredients(a); }}
                placeholder="ĐV" className="w-20 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              {ingredients.length > 1 && <button type="button" onClick={() => removeIngredient(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><HiTrash /></button>}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/recipes" className="px-6 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition">Hủy</Link>
          <button type="submit" disabled={loading} className="px-8 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition disabled:opacity-50">
            {loading ? 'Đang gửi...' : 'Gửi công thức'}
          </button>
        </div>
      </form>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { HiUser, HiFire, HiSave, HiHeart, HiBookOpen, HiEye, HiStar, HiCalendar, HiChevronDown, HiChevronUp } from 'react-icons/hi';
import { ACTIVITY_FACTORS, calculateTdee, type TdeeResult } from '@/lib/tdee-utils';

type ServingsValidation =
  | { valid: true; servings: number }
  | { valid: false; message: string };

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [calorieBreakdown, setCalorieBreakdown] = useState<any>(null);
  const [allergyInput, setAllergyInput] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [servingsError, setServingsError] = useState('');
  const [showTdeeFormula, setShowTdeeFormula] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfile();
      loadStats();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadStats = async () => {
    try {
      const res = await authAPI.getProfileStats();
      setStats(res.data);
    } catch (err) {
      console.error('Failed to load profile stats', err);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadProfile = async () => {
    try {
      const res = await authAPI.getProfile();
      setProfile(res.data);
    } catch {
      console.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const validateServings = (rawValue: unknown): ServingsValidation => {
    const value = String(rawValue ?? '').trim();
    if (!value) return { valid: false, message: 'Vui lòng nhập số người ăn.' };
    if (!/^\d+$/.test(value)) return { valid: false, message: 'Số người ăn phải là số nguyên.' };

    const servings = Number(value);
    if (servings < 1) return { valid: false, message: 'Số người ăn phải lớn hơn hoặc bằng 1.' };
    if (servings > 20) return { valid: false, message: 'Số người ăn không được vượt quá 20.' };

    return { valid: true, servings };
  };

  const saveProfile = async () => {
    const servingsValidation = validateServings(profile.preferences?.servings);
    if (!servingsValidation.valid) {
      setServingsError(servingsValidation.message);
      return;
    }

    setSaving(true);
    try {
      const res = await authAPI.updateProfile({
        fullName: profile.fullName,
        gender: profile.gender,
        dateOfBirth: profile.dateOfBirth,
        weight: profile.weight ? Number(profile.weight) : undefined,
        height: profile.height ? Number(profile.height) : undefined,
        activityLevel: profile.activityLevel,
        preferences: {
          ...profile.preferences,
          servings: servingsValidation.servings,
        },
      });
      toast.success('Đã cập nhật hồ sơ!');
      setCalorieBreakdown(res.data.calorieBreakdown);
      setServingsError('');
      refreshUser();
    } catch (err: any) {
      const message = err?.response?.data?.message;
      const normalizedMessage = Array.isArray(message) ? message[0] : message;
      toast.error(normalizedMessage || 'Cập nhật thất bại');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-20 bg-brand-light-bg min-h-screen flex flex-col justify-center items-center">
        <p className="text-5xl mb-4 animate-brand-float">👤</p>
        <p className="text-slate-500">Vui lòng <Link href="/login" className="text-brand-primary font-bold underline hover:text-brand-primary-hover">đăng nhập</Link></p>
      </div>
    );
  }

  if (loading || !profile) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-brand-lg border border-brand-light-border h-96 animate-pulse shadow-brand-sm" />
    );
  }

  const updateField = (field: string, value: any) => {
    setProfile({ ...profile, [field]: value });
  };

  const updatePref = (field: string, value: any) => {
    if (field === 'servings') {
      setServingsError('');
    }

    setProfile({
      ...profile,
      preferences: { ...profile.preferences, [field]: value },
    });
  };

  const addAllergy = () => {
    const val = allergyInput.trim().toLowerCase();
    if (!val) return;
    const current = profile.preferences?.allergies || [];
    if (!current.includes(val)) {
      updatePref('allergies', [...current, val]);
    }
    setAllergyInput('');
  };

  const removeAllergy = (indexToRemove: number) => {
    const current = profile.preferences?.allergies || [];
    updatePref('allergies', current.filter((_: any, i: number) => i !== indexToRemove));
  };

  const getRealtimeCalorieInfo = (): TdeeResult => {
    if (!profile) return { valid: false, msg: 'Chưa có thông tin hồ sơ.' };
    return calculateTdee(profile);
  };

  const calorieInfo = getRealtimeCalorieInfo();
  const currentConditions = profile?.preferences?.healthConditions
    ? profile.preferences.healthConditions.split(',').map((c: string) => c.trim().toLowerCase())
    : [];
  const isDiabetesChecked = currentConditions.includes('diabetes');
  const isHypertensionChecked = currentConditions.includes('hypertension');
  const isMuscleGainChecked = currentConditions.includes('muscle_gain');

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 py-6 bg-brand-light-bg min-h-screen">
      <h1 className="text-2xl font-bold text-slate-900">Hồ sơ & Thống kê 📊</h1>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {statsLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white border border-brand-light-border rounded-brand-md p-4 shadow-sm animate-pulse h-24" />
          ))
        ) : (
          <>
            <div className="bg-white border border-brand-light-border rounded-brand-md p-4 shadow-brand-sm flex items-center gap-3 transition hover:shadow-brand-md">
              <div className="w-10 h-10 rounded-brand-sm bg-pink-50 text-pink-600 flex items-center justify-center shrink-0">
                <HiHeart className="text-xl" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold">Yêu thích</p>
                <p className="text-lg font-black text-slate-800 mt-0.5">{stats?.totalFavorites || 0}</p>
              </div>
            </div>

            <div className="bg-white border border-brand-light-border rounded-brand-md p-4 shadow-brand-sm flex items-center gap-3 transition hover:shadow-brand-md">
              <div className="w-10 h-10 rounded-brand-sm bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <HiBookOpen className="text-xl" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold">Bài đăng</p>
                <p className="text-lg font-black text-slate-800 mt-0.5">{stats?.totalRecipes || 0}</p>
              </div>
            </div>

            <div className="bg-white border border-brand-light-border rounded-brand-md p-4 shadow-brand-sm flex items-center gap-3 transition hover:shadow-brand-md">
              <div className="w-10 h-10 rounded-brand-sm bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <HiEye className="text-xl" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold">Lượt xem</p>
                <p className="text-lg font-black text-slate-800 mt-0.5">{stats?.totalViews || 0}</p>
              </div>
            </div>

            <div className="bg-white border border-brand-light-border rounded-brand-md p-4 shadow-brand-sm flex items-center gap-3 transition hover:shadow-brand-md">
              <div className="w-10 h-10 rounded-brand-sm bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                <HiStar className="text-xl" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold">Đánh giá TB</p>
                <p className="text-lg font-black text-slate-800 mt-0.5">{stats?.averageRating || 0}★</p>
              </div>
            </div>

            <div className="bg-white border border-brand-light-border rounded-brand-md p-4 shadow-brand-sm flex items-center gap-3 transition hover:shadow-brand-md">
              <div className="w-10 h-10 rounded-brand-sm bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
                <HiCalendar className="text-xl" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold">Thực đơn</p>
                <p className="text-lg font-black text-slate-800 mt-0.5">{stats?.totalMealPlans || 0}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/my-reviews" className="bg-white border border-brand-light-border rounded-brand-md p-4 shadow-brand-sm flex items-center justify-between hover:border-brand-primary/30 hover:shadow-brand-md transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-brand-sm bg-emerald-50 text-brand-primary flex items-center justify-center shrink-0">
              <HiStar className="text-xl animate-pulse" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-slate-800">Lịch sử đánh giá của bạn</p>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Xem, chỉnh sửa hoặc xóa các đánh giá đã gửi</p>
            </div>
          </div>
          <span className="text-brand-primary font-bold text-sm">Xem ngay →</span>
        </Link>

        <Link href="/recently-viewed" className="bg-white border border-brand-light-border rounded-brand-md p-4 shadow-brand-sm flex items-center justify-between hover:border-brand-primary/30 hover:shadow-brand-md transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-brand-sm bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <HiEye className="text-xl" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-slate-800">Món ăn xem gần đây</p>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Xem lại 20 công thức bạn truy cập gần nhất</p>
            </div>
          </div>
          <span className="text-blue-600 font-bold text-sm">Xem ngay →</span>
        </Link>
      </div>

      {/* Basic Info */}
      <div className="card-dashboard bg-white space-y-4">
        <h2 className="font-bold text-slate-900 text-base flex items-center gap-2 border-b border-brand-light-border pb-3">
          <HiUser className="text-brand-primary text-xl" /> Thông tin cơ bản
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Họ tên</label>
            <input
              type="text"
              value={profile.fullName || ''}
              onChange={(e) => updateField('fullName', e.target.value)}
              className="w-full px-3 py-2 border border-brand-light-border rounded-brand-sm focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none text-sm font-medium transition"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email</label>
            <input
              type="email"
              value={profile.email || ''}
              disabled
              className="w-full px-3 py-2 border border-brand-light-border bg-slate-50 rounded-brand-sm text-sm text-slate-400 font-medium cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Giới tính</label>
            <select
              value={profile.gender || ''}
              onChange={(e) => updateField('gender', e.target.value)}
              className="w-full px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm font-medium focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none cursor-pointer"
            >
              <option value="">Chọn</option>
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Ngày sinh</label>
            <input
              type="date"
              value={profile.dateOfBirth ? profile.dateOfBirth.split('T')[0] : ''}
              onChange={(e) => updateField('dateOfBirth', e.target.value)}
              className="w-full px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm font-medium focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
            />
          </div>
        </div>
      </div>

      {/* Body Metrics (for calorie calculation) */}
      <div className="card-dashboard bg-white space-y-4">
        <h2 className="font-bold text-slate-900 text-base flex items-center gap-2 border-b border-brand-light-border pb-3">
          <HiFire className="text-brand-warning text-xl" /> Chỉ số cơ thể (tính calories)
        </h2>
        <p className="text-xs text-slate-400 font-semibold">
          Sử dụng công thức Mifflin-St Jeor để tính nhu cầu calo hàng ngày
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cân nặng (kg)</label>
            <input
              type="number"
              value={profile.weight || ''}
              onChange={(e) => updateField('weight', e.target.value)}
              placeholder="VD: 65"
              className="w-full px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm font-medium focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Chiều cao (cm)</label>
            <input
              type="number"
              value={profile.height || ''}
              onChange={(e) => updateField('height', e.target.value)}
              placeholder="VD: 170"
              className="w-full px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm font-medium focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Mức vận động</label>
            <select
              value={profile.activityLevel || ''}
              onChange={(e) => updateField('activityLevel', e.target.value)}
              className="w-full px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm font-medium focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none cursor-pointer"
            >
              <option value="">Chọn</option>
              <option value="sedentary">Ít vận động (văn phòng)</option>
              <option value="light">Nhẹ (1-3 ngày/tuần)</option>
              <option value="moderate">Vừa (3-5 ngày/tuần)</option>
              <option value="active">Nhiều (6-7 ngày/tuần)</option>
              <option value="very_active">Rất nhiều (vận động viên)</option>
            </select>
          </div>
        </div>

        {/* Calorie Result */}
        {calorieInfo.valid ? (
          <div className="card-ai-hero p-5 mt-4 animate-fade-in relative overflow-hidden border border-brand-primary/20">
            <div className="absolute top-0 right-0 w-24 h-24 bg-brand-primary/5 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap relative z-10">
              <p className="text-sm font-semibold text-slate-700 text-left">
                Nhu cầu calo hàng ngày (TDEE): 
                <span className="text-2xl font-black text-brand-primary ml-1.5">{calorieInfo.tdee} kcal</span>
              </p>
              <div className="badge-ai">🤖 AI Đo lường</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 relative z-10">
              <div className="text-center bg-white/60 p-3 rounded-brand-sm border border-brand-primary/10 hover:border-brand-primary/30 transition-all shadow-brand-sm">
                <p className="text-[10px] text-brand-primary font-extrabold uppercase tracking-wider">🌅 Sáng (30%)</p>
                <p className="font-extrabold text-slate-900 text-sm mt-1.5">{calorieInfo.breakdown?.breakfast} kcal</p>
              </div>
              <div className="text-center bg-white/60 p-3 rounded-brand-sm border border-brand-primary/10 hover:border-brand-primary/30 transition-all shadow-brand-sm">
                <p className="text-[10px] text-brand-secondary font-extrabold uppercase tracking-wider">☀️ Trưa (40%)</p>
                <p className="font-extrabold text-slate-900 text-sm mt-1.5">{calorieInfo.breakdown?.lunch} kcal</p>
              </div>
              <div className="text-center bg-white/60 p-3 rounded-brand-sm border border-brand-primary/10 hover:border-brand-primary/30 transition-all shadow-brand-sm">
                <p className="text-[10px] text-brand-accent font-extrabold uppercase tracking-wider">🌙 Tối (30%)</p>
                <p className="font-extrabold text-slate-900 text-sm mt-1.5">{calorieInfo.breakdown?.dinner} kcal</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50/50 border border-brand-warning/30 rounded-brand-sm p-4 mt-4 text-sm text-amber-800 flex items-start gap-2 font-medium">
            <span className="text-base">⚠️</span>
            <p>{calorieInfo.msg}</p>
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-brand-md border border-brand-primary/15 bg-brand-primary/5">
          <button
            type="button"
            onClick={() => setShowTdeeFormula((current) => !current)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-brand-primary/5"
            aria-expanded={showTdeeFormula}
          >
            <span>
              <span className="block text-sm font-bold text-slate-900">Công thức tính TDEE</span>
              <span className="mt-0.5 block text-xs text-slate-500">Cách hệ thống tính nhu cầu calories từ hồ sơ cơ thể</span>
            </span>
            {showTdeeFormula ? (
              <HiChevronUp className="shrink-0 text-brand-primary" />
            ) : (
              <HiChevronDown className="shrink-0 text-brand-primary" />
            )}
          </button>

          {showTdeeFormula && (
            <div className="space-y-4 border-t border-brand-primary/10 bg-white px-4 py-4 text-xs leading-5 text-slate-600">
              <p>
                Hệ thống sử dụng công thức Mifflin-St Jeor để ước tính BMR, sau đó nhân với hệ số vận động để tính TDEE.
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-brand-sm border border-slate-200 bg-slate-50 p-3">
                  <p className="font-bold text-slate-900">Công thức BMR</p>
                  <p className="mt-2"><strong>Nam:</strong> BMR = 10 × cân nặng + 6.25 × chiều cao − 5 × tuổi + 5</p>
                  <p className="mt-1"><strong>Nữ:</strong> BMR = 10 × cân nặng + 6.25 × chiều cao − 5 × tuổi − 161</p>
                  <p className="mt-2 font-semibold text-brand-primary">TDEE = BMR × hệ số vận động</p>
                </div>

                <div className="rounded-brand-sm border border-slate-200 bg-slate-50 p-3">
                  <p className="font-bold text-slate-900">Hệ số vận động</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                    {Object.values(ACTIVITY_FACTORS).map((activity) => (
                      <div key={activity.label} className="contents">
                        <span>{activity.label}</span>
                        <strong className="text-right text-slate-800">{activity.factor}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {calorieInfo.valid && (
                <div className="rounded-brand-sm border border-brand-primary/20 bg-brand-primary/5 p-3">
                  <p className="font-bold text-slate-900">Phép tính theo hồ sơ hiện tại</p>
                  <p className="mt-2">
                    {calorieInfo.weight}kg, {calorieInfo.height}cm, {calorieInfo.age} tuổi, {calorieInfo.genderLabel}, vận động {calorieInfo.activityLabel.toLowerCase()}.
                  </p>
                  <p className="mt-1 font-medium text-slate-800">
                    BMR = 10 × {calorieInfo.weight} + 6.25 × {calorieInfo.height} − 5 × {calorieInfo.age} {calorieInfo.gender === 'male' ? '+ 5' : '− 161'} = {calorieInfo.bmr.toLocaleString('vi-VN')} kcal
                  </p>
                  <p className="mt-1 font-bold text-brand-primary">
                    TDEE = {calorieInfo.bmr.toLocaleString('vi-VN')} × {calorieInfo.activityFactor} = {calorieInfo.tdee.toLocaleString('vi-VN')} kcal/ngày
                  </p>
                </div>
              )}

              <p className="text-slate-500">
                Kết quả chỉ mang tính tham khảo, không thay thế tư vấn từ chuyên gia dinh dưỡng.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Health Profile & Medical Constraints */}
      <div className="card-dashboard bg-white space-y-4 animate-fade-in">
        <h2 className="font-bold text-slate-900 text-base flex items-center gap-2 border-b border-brand-light-border pb-3">
          🩺 Hồ sơ sức khỏe & Giới hạn y khoa
        </h2>
        <p className="text-xs text-slate-500 font-semibold bg-emerald-50/50 p-3 rounded-brand-md border border-brand-primary/10">
          Bạn chỉ cần chọn tình trạng sức khỏe. Các giới hạn dinh dưỡng sẽ tự động áp dụng theo giá trị mặc định an toàn. Chỉ nhập khi muốn tùy chỉnh riêng.
        </p>

        {/* Health Conditions Checkboxes */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tình trạng sức khỏe & Bệnh lý</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { id: 'diabetes', label: 'Tiểu đường (Diabetes)', desc: 'Hạn chế tối đa đường (< 5g)' },
              { id: 'hypertension', label: 'Cao huyết áp (Hypertension)', desc: 'Hạn chế tối đa muối/natri (< 500mg)' },
              { id: 'weight_loss', label: 'Giảm cân & Béo phì', desc: 'Không vượt quá calo mục tiêu của bữa ăn' },
              { id: 'muscle_gain', label: 'Tăng cơ (Gym/Muscle Gain)', desc: 'Ưu tiên Protein cao (> 25g)' },
            ].map((cond) => {
              const currentConditions = profile.preferences?.healthConditions
                ? profile.preferences.healthConditions.split(',').map((c: string) => c.trim().toLowerCase())
                : [];
              const isChecked = currentConditions.includes(cond.id);

              return (
                <label key={cond.id} className="flex items-start gap-3 p-3 border border-brand-light-border rounded-brand-sm hover:bg-slate-50 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      let newConditions = [...currentConditions];
                      if (e.target.checked) {
                        if (!newConditions.includes(cond.id)) {
                          newConditions.push(cond.id);
                        }
                      } else {
                        newConditions = newConditions.filter((c) => c !== cond.id);
                      }
                      updatePref('healthConditions', newConditions.join(','));
                    }}
                    className="mt-1 accent-brand-primary cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">{cond.label}</span>
                    <span className="text-[10px] text-slate-400 font-medium">{cond.desc}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Custom Nutrient Bounds */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 font-medium">
          <div className="flex flex-col items-start min-h-[85px]">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Đường tối đa / bữa (g)</label>
            <input
              type="number"
              value={profile.preferences?.maxSugarPerMeal ?? ''}
              onChange={(e) => updatePref('maxSugarPerMeal', e.target.value !== '' ? Number(e.target.value) : null)}
              onFocus={() => setFocusedField('maxSugarPerMeal')}
              onBlur={() => setFocusedField(null)}
              placeholder="Để trống = 5g"
              className="w-full px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm font-medium focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
            />
            {(() => {
              const isCustom = profile.preferences?.maxSugarPerMeal !== null && profile.preferences?.maxSugarPerMeal !== undefined && profile.preferences?.maxSugarPerMeal !== '';
              const showBadge = isCustom || isDiabetesChecked || focusedField === 'maxSugarPerMeal';
              if (!showBadge) return null;
              return isCustom ? (
                <span className="inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  ✓ Đang sử dụng giá trị tùy chỉnh: {profile.preferences.maxSugarPerMeal}g
                </span>
              ) : (
                <span className="inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  ✓ Đang sử dụng giá trị mặc định: 5g
                </span>
              );
            })()}
          </div>
          <div className="flex flex-col items-start min-h-[85px]">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Muối (Natri) tối đa / bữa (mg)</label>
            <input
              type="number"
              value={profile.preferences?.maxSodiumPerMeal ?? ''}
              onChange={(e) => updatePref('maxSodiumPerMeal', e.target.value !== '' ? Number(e.target.value) : null)}
              onFocus={() => setFocusedField('maxSodiumPerMeal')}
              onBlur={() => setFocusedField(null)}
              placeholder="Để trống = 500mg"
              className="w-full px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm font-medium focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
            />
            {(() => {
              const isCustom = profile.preferences?.maxSodiumPerMeal !== null && profile.preferences?.maxSodiumPerMeal !== undefined && profile.preferences?.maxSodiumPerMeal !== '';
              const showBadge = isCustom || isHypertensionChecked || focusedField === 'maxSodiumPerMeal';
              if (!showBadge) return null;
              return isCustom ? (
                <span className="inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  ✓ Đang sử dụng giá trị tùy chỉnh: {profile.preferences.maxSodiumPerMeal}mg
                </span>
              ) : (
                <span className="inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  ✓ Đang sử dụng giá trị mặc định: 500mg
                </span>
              );
            })()}
          </div>
          <div className="flex flex-col items-start min-h-[85px]">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Protein tối thiểu / bữa (g)</label>
            <input
              type="number"
              value={profile.preferences?.minProteinPerMeal ?? ''}
              onChange={(e) => updatePref('minProteinPerMeal', e.target.value !== '' ? Number(e.target.value) : null)}
              onFocus={() => setFocusedField('minProteinPerMeal')}
              onBlur={() => setFocusedField(null)}
              placeholder="Để trống = 25g"
              className="w-full px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm font-medium focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
            />
            {(() => {
              const isCustom = profile.preferences?.minProteinPerMeal !== null && profile.preferences?.minProteinPerMeal !== undefined && profile.preferences?.minProteinPerMeal !== '';
              const showBadge = isCustom || isMuscleGainChecked || focusedField === 'minProteinPerMeal';
              if (!showBadge) return null;
              return isCustom ? (
                <span className="inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  ✓ Đang sử dụng giá trị tùy chỉnh: {profile.preferences.minProteinPerMeal}g
                </span>
              ) : (
                <span className="inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  ✓ Đang sử dụng giá trị mặc định: 25g
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Food Allergy Card (Top) */}
      <div className="card-dashboard bg-white space-y-4">
        <h2 className="font-bold text-slate-900 text-base border-b border-brand-light-border pb-3 flex items-center gap-2">
          ⚠️ Dị ứng thực phẩm (Chất gây dị ứng)
        </h2>
        <div className="mt-2">
          <p className="text-xs text-slate-400 mb-2 font-medium">
            Nhập các thành phần bạn bị dị ứng. AI sẽ tự động loại bỏ các món ăn có chứa các chất này ra khỏi gợi ý và thực đơn tuần của bạn.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addAllergy();
                }
              }}
              placeholder="Nhập tên chất dị ứng (VD: tôm, lạc, sữa, hải sản...) và bấm Enter"
              className="flex-1 px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm outline-none focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary font-medium"
            />
            <button
              type="button"
              onClick={addAllergy}
              className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-brand-sm text-xs font-bold border border-rose-100 transition-all cursor-pointer shadow-brand-sm"
            >
              Thêm tag
            </button>
          </div>
          {profile.preferences?.allergies && profile.preferences.allergies.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {profile.preferences.allergies.map((allergy: string, i: number) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-700 border border-rose-100 rounded-brand-sm text-xs font-bold shadow-brand-sm transition-all"
                >
                  ⚠️ {allergy}
                  <button
                    type="button"
                    onClick={() => removeAllergy(i)}
                    className="hover:bg-rose-200 rounded-full p-0.5 text-xs text-rose-500 hover:text-rose-800 transition cursor-pointer"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Culinary Preferences Card (Bottom) */}
      <div className="card-dashboard bg-white space-y-4">
        <h2 className="font-bold text-slate-900 text-base border-b border-brand-light-border pb-3">
          🍽️ Sở thích ẩm thực
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Chế độ ăn</label>
            <select
              value={profile.preferences?.dietType || ''}
              onChange={(e) => updatePref('dietType', e.target.value)}
              className="w-full px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm font-medium focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none cursor-pointer"
            >
              <option value="">Bình thường</option>
              <option value="vegetarian">Ăn chay</option>
              <option value="lowcarb">Low carb (Hạn chế tinh bột)</option>
              <option value="keto">Keto (Cắt tinh bột, nhiều béo)</option>
            </select>
            <p className="text-[10px] text-slate-400 mt-1.5 font-medium">Lựa chọn chế độ ăn kiêng phù hợp (nếu có)</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Thời gian nấu tối đa (phút)</label>
            <input
              type="number"
              value={profile.preferences?.maxCookingTime || ''}
              onChange={(e) => updatePref('maxCookingTime', Number(e.target.value))}
              placeholder="VD: 30"
              className="w-full px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm font-medium focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
            />
            <p className="text-[10px] text-slate-400 mt-1.5 font-medium">Để trống nếu không giới hạn thời gian nấu</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Ngân sách/bữa (VNĐ)</label>
            <input
              type="number"
              value={profile.preferences?.budgetPerMeal || ''}
              onChange={(e) => updatePref('budgetPerMeal', Number(e.target.value))}
              placeholder="VD: 50000"
              className="w-full px-3 py-2 border border-brand-light-border rounded-brand-sm text-sm font-medium focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
            />
            <p className="text-[10px] text-slate-400 mt-1.5 font-medium">Để trống nếu không giới hạn ngân sách</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Số người ăn *</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={profile.preferences?.servings ?? ''}
              onChange={(e) => {
                const nextValue = e.target.value;
                if (nextValue === '' || /^\d+$/.test(nextValue)) {
                  updatePref('servings', nextValue);
                }
              }}
              placeholder="VD: 4"
              aria-invalid={!!servingsError}
              className={`w-full px-3 py-2 border rounded-brand-sm text-sm font-medium focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none ${
                servingsError ? 'border-red-300 bg-red-50/40' : 'border-brand-light-border'
              }`}
            />
            {servingsError ? (
              <p className="mt-1.5 text-[10px] font-semibold text-red-600">{servingsError}</p>
            ) : (
              <p className="mt-1.5 text-[10px] font-medium text-slate-400">
                Bắt buộc nhập số người ăn để hệ thống gợi ý khẩu phần chính xác.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={saveProfile}
        disabled={saving}
        className="w-full py-3 btn-primary text-base"
      >
        <HiSave className="text-lg" /> {saving ? 'Đang lưu...' : 'Lưu hồ sơ'}
      </button>
    </div>
  );
}

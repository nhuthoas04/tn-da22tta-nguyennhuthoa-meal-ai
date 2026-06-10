'use client';
import { useEffect, useState } from 'react';
import { recipesAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { 
  HiPlus, HiEye, HiPencil, HiTrash, HiRefresh,
  HiChevronLeft, HiChevronRight,
  HiStar, HiChatAlt2, HiCalendar
} from 'react-icons/hi';

export default function MyRecipesPage() {
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Filtering States
  const [selectedStatus, setSelectedStatus] = useState(''); // 'approved' | 'pending' | 'rejected' | ''

  // Modal deletion confirmation
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    recipeId: '',
    recipeName: ''
  });

  useEffect(() => {
    loadSubmissions();
  }, [page, selectedStatus]);

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      const res = await recipesAPI.getMySubmissions({
        page,
        limit: 5,
        status: selectedStatus || undefined,
      });
      setSubmissions(res.data.data);
      setTotalPages(res.data.meta.totalPages || 1);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi khi tải danh sách bài đăng');
    } finally {
      setLoading(false);
    }
  };

  const handleResubmit = async (id: string) => {
    try {
      await recipesAPI.resubmitSubmission(id);
      toast.success('Đã gửi lại công thức thành công!');
      loadSubmissions();
    } catch (err) {
      toast.error('Không thể gửi lại công thức');
    }
  };

  const handleDelete = async () => {
    try {
      await recipesAPI.deleteSubmission(deleteModal.recipeId);
      toast.success('Đã xóa công thức thành công');
      setDeleteModal({ isOpen: false, recipeId: '', recipeName: '' });
      if (submissions.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        loadSubmissions();
      }
    } catch (err) {
      toast.error('Không thể xóa công thức');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-brand-success bg-brand-primary/10 rounded-brand-sm border border-brand-primary/20">
            ● Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-brand-danger bg-brand-danger/10 rounded-brand-sm border border-brand-danger/20">
            ● Rejected
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-brand-warning bg-brand-warning/10 rounded-brand-sm border border-brand-warning/20">
            ● Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 py-6 bg-brand-light-bg min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bài đăng của tôi 📝</h1>
          <p className="text-sm text-slate-500 mt-1">Quản lý và theo dõi các công thức món ăn bạn đã chia sẻ</p>
        </div>
        <Link
          href="/recipes/submit"
          className="btn-primary"
        >
          <HiPlus /> Chia sẻ món mới
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b border-brand-light-border flex gap-4 text-sm select-none shrink-0 overflow-x-auto scrollbar-none">
        {[
          { label: 'Tất cả', value: '' },
          { label: 'Chờ duyệt', value: 'pending' },
          { label: 'Đã duyệt', value: 'approved' },
          { label: 'Bị từ chối', value: 'rejected' },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setSelectedStatus(tab.value); setPage(1); }}
            className={`py-3 font-bold border-b-2 px-1 transition-all shrink-0 cursor-pointer ${
              selectedStatus === tab.value
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-slate-400 hover:text-slate-900 hover:border-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main List Area */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white border border-brand-light-border rounded-brand-md h-32 shadow-brand-sm" />
          ))}
        </div>
      ) : submissions.length === 0 ? (
        <div className="card-dashboard p-16 text-center">
          <p className="text-5xl mb-4 animate-brand-float">🍳</p>
          <h3 className="text-lg font-bold text-slate-900 mb-1">Chưa có bài đăng nào</h3>
          <p className="text-slate-500 max-w-sm mx-auto text-sm mb-6 font-medium">
            Hãy đăng tải công thức gia truyền hoặc món ăn đặc sắc của bạn để chia sẻ cùng cộng đồng MealAI!
          </p>
          <Link
            href="/recipes/submit"
            className="btn-primary inline-flex"
          >
            <HiPlus /> Chia sẻ món ăn ngay
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map((recipe) => (
            <div key={recipe.id} className="card-dashboard p-4 flex flex-col md:flex-row gap-4 hover:shadow-brand-lg">
              {/* Image Preview */}
              <div className="w-full md:w-32 h-32 md:h-auto rounded-brand-sm bg-slate-50 shrink-0 overflow-hidden relative border border-brand-light-border flex items-center justify-center text-4xl select-none">
                {recipe.imageUrl ? (
                  <img
                    src={recipe.imageUrl}
                    alt={recipe.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  '🥗'
                )}
              </div>

              {/* Info Area */}
              <div className="flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-slate-950 text-base">
                      {recipe.name}
                    </h3>
                    {getStatusBadge(recipe.status)}
                  </div>
                  
                  {recipe.description && (
                    <p className="text-sm text-slate-500 line-clamp-1">
                      {recipe.description}
                    </p>
                  )}

                  {/* Submission date and status alerts */}
                  <div className="flex flex-wrap gap-4 text-xs text-slate-400 font-semibold">
                    <span>Đăng: {new Date(recipe.createdAt).toLocaleDateString('vi-VN')}</span>
                    <span className="flex items-center gap-1"><HiEye className="text-sm" /> {recipe.views || 0}</span>
                    <span className="flex items-center gap-1"><HiStar className="text-sm text-brand-accent" /> {recipe.averageRating || 0}★</span>
                    <span className="flex items-center gap-1"><HiChatAlt2 className="text-sm" /> {recipe.commentsCount || 0}</span>
                  </div>

                  {/* Rejection Alert */}
                  {recipe.status === 'rejected' && recipe.rejectionReason && (
                    <div className="p-3 bg-rose-50 border border-brand-danger/20 rounded-brand-md text-xs text-brand-danger space-y-1 mt-2">
                      <p className="font-bold">⚠️ Lý do bị từ chối duyệt:</p>
                      <p className="italic">"{recipe.rejectionReason}"</p>
                    </div>
                  )}
                </div>

                {/* Buttons Bar */}
                <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-brand-light-border">
                  <Link 
                    href={`/recipes/${recipe.id}`}
                    className="px-3 py-1.5 border border-brand-light-border rounded-brand-sm text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <HiEye /> Xem
                  </Link>

                  {/* Can edit if pending or rejected. Resubmitting will reset status */}
                  <Link 
                    href={`/recipes/${recipe.id}/edit`}
                    className="px-3 py-1.5 border border-brand-light-border rounded-brand-sm text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <HiPencil /> Chỉnh sửa
                  </Link>

                  <button 
                    onClick={() => setDeleteModal({ isOpen: true, recipeId: recipe.id, recipeName: recipe.name })}
                    className="px-3 py-1.5 border border-brand-danger/30 rounded-brand-sm text-xs font-bold text-brand-danger bg-white hover:bg-brand-danger/10 transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <HiTrash /> Xóa
                  </button>

                  {recipe.status === 'rejected' && (
                    <button 
                      onClick={() => handleResubmit(recipe.id)}
                      className="btn-primary-sm gap-1"
                    >
                      <HiRefresh /> Gửi lại để duyệt
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 border border-brand-light-border rounded-brand-sm hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer"
          >
            <HiChevronLeft className="text-lg" />
          </button>
          <span className="text-sm font-bold text-slate-600">
            Trang {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 border border-brand-light-border rounded-brand-sm hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer"
          >
            <HiChevronRight className="text-lg" />
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
          <div className="bg-white rounded-brand-lg max-w-md w-full p-6 shadow-brand-lg space-y-4 border border-brand-light-border">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Xác nhận xóa công thức</h3>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                Bạn có chắc chắn muốn xóa công thức <span className="font-bold text-slate-800">"{deleteModal.recipeName}"</span> không? Hành động này không thể hoàn tác.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteModal({ isOpen: false, recipeId: '', recipeName: '' })}
                className="btn-ghost-sm"
              >
                Hủy
              </button>
              <button
                onClick={handleDelete}
                className="px-5 py-2.5 bg-brand-danger hover:bg-red-600 text-white rounded-brand-sm text-sm font-bold transition-all cursor-pointer shadow-brand-sm border-none outline-none"
              >
                Xóa công thức
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

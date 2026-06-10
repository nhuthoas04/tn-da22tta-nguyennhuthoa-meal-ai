'use client';
import { useEffect, useState } from 'react';
import { authAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { HiPlus, HiPencil, HiTrash, HiSearch, HiUserAdd, HiUsers } from 'react-icons/hi';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  
  // Delete confirm states
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await authAPI.adminListAllUsers();
      setUsers(res.data.data || []);
    } catch (err: any) {
      console.error(err);
      toast.error('Không thể lấy danh sách thành viên');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    setEmail('');
    setFullName('');
    setPassword('');
    setRole('user');
    setModalOpen(true);
  };

  const handleOpenEdit = (user: any) => {
    setEditingUser(user);
    setEmail(user.email);
    setFullName(user.fullName);
    setPassword('');
    setRole(user.role);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !fullName) {
      toast.error('Vui lòng điền đầy đủ email và họ tên');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        // Edit Mode
        const updateData: any = { email, fullName, role };
        if (password) updateData.password = password;
        
        await authAPI.adminUpdateUser(editingUser.id, updateData);
        toast.success('Cập nhật thông tin thành viên thành công!');
      } else {
        // Create Mode
        if (!password) {
          toast.error('Vui lòng nhập mật khẩu cho tài khoản mới');
          setSaving(false);
          return;
        }
        await authAPI.adminCreateUser({ email, fullName, password, role });
        toast.success('Thêm thành viên mới thành công!');
      }
      setModalOpen(false);
      loadUsers();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra, vui lòng thử lại');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await authAPI.adminDeleteUser(deleteId);
      toast.success('Xóa tài khoản thành công!');
      setDeleteId(null);
      loadUsers();
    } catch (err: any) {
      console.error(err);
      toast.error('Không thể xóa tài khoản này');
    } finally {
      setDeleting(false);
    }
  };

  const filteredUsers = users.filter((user) =>
    user.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.role?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HiUsers className="text-purple-600" /> Quản lý thành viên
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Tổng cộng có {users.length} tài khoản thành viên trong hệ thống.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-medium hover:from-purple-700 hover:to-indigo-700 transition shadow-sm hover:shadow-md"
        >
          <HiPlus /> Thêm thành viên
        </button>
      </div>

      {/* Search & Statistics */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
        <HiSearch className="text-gray-400 text-lg ml-2" />
        <input
          type="text"
          placeholder="Tìm kiếm theo họ tên, email hoặc vai trò..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full text-sm border-0 focus:ring-0 focus:outline-none placeholder-gray-400 text-gray-800"
        />
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-24 text-center">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Đang tải danh sách thành viên...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-5xl mb-3">👥</p>
            <h3 className="text-lg font-bold text-gray-900">Không có thành viên</h3>
            <p className="text-gray-500 text-sm mt-1">Không tìm thấy tài khoản nào phù hợp với từ khóa.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Họ & Tên</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vai trò</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mục tiêu Calo</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ngày tham gia</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-100 to-indigo-100 flex items-center justify-center font-bold text-purple-700">
                          {user.fullName ? user.fullName[0].toUpperCase() : 'U'}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{user.fullName}</p>
                          <p className="text-xs text-gray-400 capitalize">{user.gender || 'Chưa cập nhật giới tính'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-bold ${
                        user.role === 'admin' 
                          ? 'bg-purple-100 text-purple-800 border border-purple-200' 
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        {user.role === 'admin' ? '👑 Admin' : '👤 User'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                      {user.dailyCalorieTarget ? `${user.dailyCalorieTarget} kcal` : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleOpenEdit(user)}
                          className="p-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 transition"
                          title="Sửa thông tin"
                        >
                          <HiPencil />
                        </button>
                        <button
                          onClick={() => setDeleteId(user.id)}
                          className="p-1.5 border border-red-100 rounded-lg text-red-500 hover:bg-red-50 transition"
                          title="Xóa tài khoản"
                        >
                          <HiTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-gray-100 max-w-md w-full shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-55 flex items-center gap-2.5">
              <HiUserAdd className="text-xl text-purple-600" />
              <h3 className="text-lg font-bold text-gray-900">
                {editingUser ? 'Sửa thông tin thành viên' : 'Thêm thành viên mới'}
              </h3>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Họ và Tên</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm border-gray-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm border-gray-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  Mật khẩu {editingUser && <span className="text-[10px] text-gray-400 capitalize">(Để trống nếu không đổi)</span>}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingUser ? "Nhập mật khẩu mới..." : "Nhập mật khẩu..."}
                  className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm border-gray-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Vai trò</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm border-gray-200"
                >
                  <option value="user">User (Thành viên chuẩn)</option>
                  <option value="admin">Admin (Quản trị viên)</option>
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 text-gray-700 transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium transition shadow-sm disabled:opacity-50"
                >
                  {saving ? 'Đang lưu...' : 'Lưu lại'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900">Xác nhận xóa tài khoản?</h3>
            <p className="text-gray-500 text-sm mt-2">
              Hành động này không thể hoàn tác. Mọi thông tin liên quan đến tài khoản này sẽ bị xóa khỏi hệ thống.
            </p>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 text-gray-700"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition"
              >
                {deleting ? 'Đang xóa...' : 'Đồng ý xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

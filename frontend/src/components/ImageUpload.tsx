'use client';
import { useEffect, useState, useRef } from 'react';
import { uploadAPI } from '@/lib/api';
import { HiPhotograph, HiX } from 'react-icons/hi';
import toast from 'react-hot-toast';

const getFallbackApiBase = () => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return 'https://tn-da22tta-nguyennhuthoa-meal-ai-backend.onrender.com';
    }
  }
  return 'http://localhost:3001';
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || getFallbackApiBase();

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}

export default function ImageUpload({ value, onChange, label = 'Ảnh món ăn' }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrlInput(value?.startsWith('http') ? value : '');
  }, [value]);

  const handleUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File tối đa 5MB');
      return;
    }
    setUploading(true);
    try {
      const res = await uploadAPI.uploadImage(file);
      onChange(res.data.url);
      toast.success('Upload ảnh thành công!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi upload');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleUseImageUrl = () => {
    const nextUrl = urlInput.trim();

    if (!nextUrl) {
      onChange('');
      return;
    }

    if (!/^https?:\/\/.+/i.test(nextUrl)) {
      toast.error('Vui lòng nhập link ảnh bắt đầu bằng http:// hoặc https://');
      return;
    }

    onChange(nextUrl);
    toast.success('Đã dùng link ảnh');
  };

  const imageUrl = value ? (value.startsWith('http') ? value : `${API_BASE}${value}`) : '';

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>

      {value ? (
        <div className="relative group">
          <img
            src={imageUrl}
            alt="Preview"
            className="w-full h-48 object-cover rounded-xl border border-gray-200"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-3 py-1.5 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100"
            >
              Đổi ảnh
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600"
            >
              <HiX />
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            dragActive
              ? 'border-purple-400 bg-purple-50'
              : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50/50'
          }`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Đang tải lên...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                <HiPhotograph className="text-2xl text-purple-600" />
              </div>
              <p className="text-sm font-medium text-gray-700">
                Kéo thả ảnh, <span className="text-purple-600">chọn file</span> hoặc dán link ảnh bên dưới
              </p>
              <p className="text-xs text-gray-400">JPG, PNG, WebP - Tối đa 5MB</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
          Hoặc dùng đường link ảnh
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com/anh-mon-an.jpg"
            className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white"
          />
          <button
            type="button"
            onClick={handleUseImageUrl}
            className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition"
          >
            Dùng link
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Hỗ trợ ảnh công khai từ internet. Link sẽ được lưu trực tiếp vào công thức.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

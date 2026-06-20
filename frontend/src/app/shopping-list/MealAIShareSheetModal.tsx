'use client';
import React from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineDownload,
  HiClipboardCopy,
  HiOutlineShare,
  HiOutlineDocumentText,
} from 'react-icons/hi';
import {
  formatShoppingListShareText,
  getFilenameDateStr,
  downloadTxtFile,
} from '@/lib/shareHelper';
import api from '@/lib/api';

export default function MealAIShareSheetModal({
  open,
  onClose,
  shoppingList,
  onExportPDF,
}: {
  open: boolean;
  onClose: () => void;
  shoppingList: any;
  onExportPDF: () => void;
}) {
  if (!open || !shoppingList) return null;

  const handleCopyNote = () => {
    const text = formatShoppingListShareText(shoppingList);
    navigator.clipboard.writeText(text);
    toast.success('Đã sao chép danh sách mua sắm dạng ghi chú!');
  };

  const handleDownloadTxt = () => {
    const text = formatShoppingListShareText(shoppingList);
    const dateStr = getFilenameDateStr(shoppingList.createdAt);
    downloadTxtFile(`MealAI-Danh-sach-mua-sam-${dateStr}.txt`, text);
    toast.success('Đã tải xuống file ghi chú (.txt)!');
  };

  const handleSharePDF = async () => {
    const toastId = toast.loading('Đang chuẩn bị file PDF để chia sẻ...');
    try {
      const res = await api.get(`/shopping-lists/${shoppingList.id}/pdf`, {
        responseType: 'blob',
      });
      const dateStr = getFilenameDateStr(shoppingList.createdAt);
      const filename = `MealAI-Danh-sach-mua-sam-${dateStr}.pdf`;
      const file = new File([res.data], filename, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Danh sách mua sắm - ${shoppingList.name}`,
          text: 'Chia sẻ danh sách mua sắm từ MealAI',
        });
        toast.success('Chia sẻ PDF thành công!', { id: toastId });
      } else {
        // Fallback to downloading
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(res.data);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Trình duyệt không hỗ trợ chia sẻ file. Đã tự động tải xuống PDF.', {
          id: toastId,
          duration: 4000,
        });
      }
    } catch (err) {
      console.error(err);
      toast.error('Có lỗi xảy ra khi chuẩn bị file chia sẻ', { id: toastId });
    }
  };

  const handleSocialShare = (platform: string, url: string) => {
    const text = formatShoppingListShareText(shoppingList);
    navigator.clipboard.writeText(text);
    toast.success(`Đã copy nội dung. Đang mở ${platform} để bạn gửi tin nhắn...`, {
      duration: 3000,
    });
    setTimeout(() => {
      window.open(url, '_blank');
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-100 dark:border-gray-800 overflow-hidden flex flex-col transform transition-all duration-300 scale-100 animate-slide-in">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-xl">📢</span>
            <h3 className="font-bold text-base tracking-wide">Chia sẻ danh sách mua sắm</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 text-white/80 hover:text-white transition cursor-pointer"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
          
          {/* PDF & Document Options */}
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">
              Tài liệu & Tải về
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onExportPDF}
                className="flex items-center gap-2 p-3 border border-slate-200 dark:border-gray-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 hover:border-emerald-200 dark:hover:border-emerald-800 rounded-xl text-left transition cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 flex items-center justify-center shrink-0">
                  <HiOutlineDownload className="text-lg" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Tải PDF</p>
                  <p className="text-[10px] text-slate-400">Lưu về máy</p>
                </div>
              </button>

              <button
                onClick={handleSharePDF}
                className="flex items-center gap-2 p-3 border border-slate-200 dark:border-gray-700 hover:bg-teal-50 dark:hover:bg-teal-950/20 hover:border-teal-200 dark:hover:border-teal-800 rounded-xl text-left transition cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/20 text-teal-600 flex items-center justify-center shrink-0">
                  <HiOutlineShare className="text-lg" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Chia sẻ PDF</p>
                  <p className="text-[10px] text-slate-400">Share qua app</p>
                </div>
              </button>

              <button
                onClick={handleCopyNote}
                className="flex items-center gap-2 p-3 border border-slate-200 dark:border-gray-700 hover:bg-amber-50 dark:hover:bg-amber-950/20 hover:border-amber-200 dark:hover:border-amber-800 rounded-xl text-left transition cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 flex items-center justify-center shrink-0">
                  <HiClipboardCopy className="text-lg" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Copy ghi chú</p>
                  <p className="text-[10px] text-slate-400">Sao chép nhanh</p>
                </div>
              </button>

              <button
                onClick={handleDownloadTxt}
                className="flex items-center gap-2 p-3 border border-slate-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-950/20 hover:border-blue-200 dark:hover:border-blue-800 rounded-xl text-left transition cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center shrink-0">
                  <HiOutlineDocumentText className="text-lg" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Tải file .txt</p>
                  <p className="text-[10px] text-slate-400">Lưu note ghi chú</p>
                </div>
              </button>
            </div>
          </div>

          {/* Social Media Sharing */}
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">
              Gửi qua mạng xã hội
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() =>
                  handleSocialShare('Messenger', 'https://m.me')
                }
                className="flex items-center gap-2.5 p-2.5 border border-slate-100 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl text-left transition cursor-pointer"
              >
                <span className="text-xl">💬</span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Messenger</span>
              </button>

              <button
                onClick={() =>
                  handleSocialShare('Facebook', 'https://facebook.com')
                }
                className="flex items-center gap-2.5 p-2.5 border border-slate-100 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl text-left transition cursor-pointer"
              >
                <span className="text-xl">👥</span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Facebook</span>
              </button>

              <button
                onClick={() =>
                  handleSocialShare('Zalo', 'https://zalo.me')
                }
                className="flex items-center gap-2.5 p-2.5 border border-slate-100 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl text-left transition cursor-pointer"
              >
                <span className="text-xl">🌀</span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Zalo</span>
              </button>

              <button
                onClick={() =>
                  handleSocialShare('Instagram', 'https://instagram.com')
                }
                className="flex items-center gap-2.5 p-2.5 border border-slate-100 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl text-left transition cursor-pointer"
              >
                <span className="text-xl">📸</span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Instagram</span>
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-slate-50 dark:bg-gray-850 p-4 border-t border-slate-100 dark:border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition cursor-pointer"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
}

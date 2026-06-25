import { HiExclamation } from 'react-icons/hi';

type AllergyWarningModalProps = {
  recipeName: string;
  matchedAllergens: string[];
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  isSubmitting?: boolean;
};

export default function AllergyWarningModal({
  recipeName,
  matchedAllergens,
  onCancel,
  onConfirm,
  isSubmitting = false,
}: AllergyWarningModalProps) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="allergy-warning-title"
        className="w-full max-w-md overflow-hidden rounded-brand-lg border border-red-200 bg-white shadow-brand-lg animate-scale-up"
      >
        <div className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-xl text-red-700">
            <HiExclamation aria-hidden="true" />
          </span>
          <h2 id="allergy-warning-title" className="text-base font-bold text-slate-900">
            ⚠️ Cảnh báo dị ứng thực phẩm
          </h2>
        </div>

        <div className="space-y-4 p-5 text-sm text-slate-600">
          <p className="text-base font-semibold leading-6 text-slate-800">
            Phát hiện nguyên liệu gây dị ứng trong món ăn này!
          </p>

          <div className="space-y-3 rounded-brand-md border border-slate-200 bg-slate-50 p-4">
            <DetailRow label="Món ăn" value={recipeName} />
            <DetailRow
              label="Nguyên liệu gây dị ứng"
              value={matchedAllergens.join(', ')}
              valueClassName="text-red-600 font-bold"
            />
          </div>

          <p className="text-xs leading-5 text-slate-500">
            Món ăn này chứa các thành phần trùng khớp hoặc thuộc nhóm chất gây dị ứng đã được lưu trong hồ sơ của bạn. Bạn vẫn muốn tiếp tục thêm món này vào thực đơn?
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full rounded-brand-sm px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isSubmitting}
            className="w-full rounded-brand-sm bg-red-500 px-4 py-2 text-xs font-bold text-white shadow-brand-sm transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {isSubmitting ? 'Đang thêm...' : 'Vẫn thêm món'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClassName = 'text-slate-900',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-xs font-medium">
      <span className="text-slate-500">{label}:</span>
      <strong className={`max-w-[210px] text-right font-bold ${valueClassName}`} title={value}>
        {value}
      </strong>
    </div>
  );
}

import { useState } from 'react';
import { useApp } from '../context/AppContext';

function formatVictimName(title) {
  const match = title.match(/^\d{2}-\d{2}-\d{4}-(.+)$/);
  return match ? match[1] : title;
}

export default function DeleteVictimModal({ victim, onClose, onDeleted }) {
  const { deleteVictim } = useApp();
  const [deleting, setDeleting] = useState(false);

  if (!victim) return null;

  const name = formatVictimName(victim.title);

  const handleConfirm = async () => {
    setDeleting(true);
    const ok = await deleteVictim(victim);
    setDeleting(false);
    if (ok) onDeleted?.();
    else onClose();
  };

  return (
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={deleting ? undefined : onClose}
    >
      <div
        className="bg-[#0f1117] border border-[#21262d] rounded-xl w-full max-w-md shadow-2xl fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#21262d]">
          <h2 className="text-sm font-semibold text-[#e6edf3]">Delete victim?</h2>
          <p className="text-xs text-[#8b949e] mt-1">
            This removes the sheet tab from Google Sheets and from this panel.
          </p>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-[#e6edf3]">
            Are you sure you want to delete{' '}
            <span className="text-[#00ff88] font-mono">{name}</span>?
          </p>
          <p className="text-[10px] text-[#484f58] mt-2 truncate" title={victim.title}>
            Tab: {victim.title}
          </p>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#21262d]">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 text-xs rounded-lg text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22] transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={deleting}
            className="px-4 py-2 text-xs rounded-lg bg-[#ff4757]/20 text-[#ff4757] border border-[#ff4757]/40 hover:bg-[#ff4757]/30 transition-colors disabled:opacity-40"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Trash2, Zap, X, AlertTriangle, Link2Off } from 'lucide-react';

export interface ModelItem {
  name: string;
  path: string;
  isSymlink: boolean;
  source?: string;
  size?: number;
  finalModelName?: string;
  ollamaTag?: string;
  centralPath?: string;
}

interface DeleteModalProps {
  isOpen: boolean;
  models: ModelItem[];
  onClose: () => void;
  onConfirm: (action: 'delete' | 'decentralize' | 'centralize') => void;
  initialAction?: 'delete' | 'decentralize' | 'centralize' | null;
}

export default function DeleteModal({ isOpen, models, onClose, onConfirm, initialAction = null }: DeleteModalProps) {
  const [selectedAction, setSelectedAction] = useState<'delete' | 'decentralize' | 'centralize' | null>(initialAction);
  const [confirmChecked, setConfirmChecked] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedAction(initialAction);
      setConfirmChecked(false);
    }
  }, [isOpen, initialAction]);

  if (!isOpen || models.length === 0) return null;

  const isSingle = models.length === 1;
  const model = models[0];
  
  // Logic for what actions are available
  const hasSymlinks = models.some(m => m.isSymlink);
  const hasStandalones = models.some(m => !m.isSymlink);

  const handleExecute = () => {
    if (selectedAction) {
      onConfirm(selectedAction);
      setSelectedAction(null);
      setConfirmChecked(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-slate-900 border border-slate-800 rounded-lg p-2 max-w-full shadow-xl animate-in scale-100 duration-200">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-1 text-xs text-slate-300 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-4 mb-8">
          <div className="p-4 bg-red-500/10 rounded-2xl text-red-500">
            <AlertTriangle size={32} />
          </div>
          <div>
            <h3 className="text-2xl font-black text-white">
              {isSingle ? `Manage "${model.name}"` : `${models.length} models selected`}
            </h3>
            <p className="text-slate-500 text-sm mt-1">
              Choose an action to proceed
            </p>
          </div>
        </div>

        <div className="space-y-4 mb-8">
          {selectedAction === null ? (
            <>
              {/* Option 1: Centralize (for standalones) */}
              {hasStandalones && (
                <button
                  onClick={() => setSelectedAction('centralize')}
                  className="w-full p-4 rounded-2xl border border-slate-800 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all flex items-center gap-4 text-left"
                >
                  <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                    <Zap size={24} />
                  </div>
                  <div>
                    <span className="text-white font-black text-sm block">Centralize Model{models.length > 1 ? 's' : ''}</span>
                    <span className="text-slate-500 text-[10px] leading-tight block mt-1">
                      Create hardlinks in the central folder. Both locations will point to the same physical data without extra disk usage.
                    </span>
                  </div>
                </button>
              )}

              {/* Option 2: Decentralize (for symlinks) */}
              {hasSymlinks && (
                <button
                  onClick={() => setSelectedAction('decentralize')}
                  className="w-full p-4 rounded-2xl border border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex items-center gap-4 text-left"
                >
                  <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
                    <Link2Off size={24} />
                  </div>
                  <div>
                    <span className="text-white font-black text-sm block">Decentralize / Remove Link</span>
                    <span className="text-slate-500 text-[10px] leading-tight block mt-1">
                      Removes only the reference in the central folder. The original file in the provider directory will remain intact.
                    </span>
                  </div>
                </button>
              )}
              
              {/* Option 3: Delete Permanently */}
              <button
                onClick={() => setSelectedAction('delete')}
                className="w-full p-6 rounded-2xl border border-red-500/30 hover:bg-red-500/10 transition-all flex items-center gap-4 text-left"
              >
                <div className="p-3 bg-red-500/10 rounded-xl text-red-500">
                  <Trash2 size={24} />
                </div>
                <div>
                  <span className="text-red-500 font-black text-sm block">
                    Delete Permanently
                  </span>
                  <span className="text-slate-500 text-[10px] leading-tight block mt-1">
                    ERASES the physical files from disk. This action is irreversible and will remove both the reference and the original data.
                  </span>
                </div>
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-800">
                <p className="text-slate-400 text-xs leading-relaxed">
                  {selectedAction === 'delete' ? (
                    'WARNING: You are about to permanently delete the selected files. This cannot be undone.'
                  ) : selectedAction === 'centralize' ? (
                    'Models will be linked to the configured central folder using hardlinks. No extra disk space will be used.'
                  ) : (
                    'Only the references in the central folder will be removed. The original files in the provider directories will not be affected.'
                  )}
                </p>
              </div>
              
              <div className="flex items-center gap-3 p-2">
                <input
                  type="checkbox"
                  id="confirm-action"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  className="w-5 h-5 rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-blue-500/20 cursor-pointer"
                />
                <label htmlFor="confirm-action" className="text-slate-400 text-xs cursor-pointer select-none">
                  I am aware and wish to proceed
                </label>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setSelectedAction(null); setConfirmChecked(false); }}
                  className="flex-1 py-4 rounded-2xl border border-slate-800 text-slate-400 font-black text-xs uppercase hover:bg-slate-800 transition-all"
                >
                  Back
                </button>
                <button
                  onClick={handleExecute}
                  disabled={!confirmChecked}
                  className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase transition-all shadow-lg ${
                    confirmChecked
                      ? selectedAction === 'delete'
                        ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-500/20'
                        : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/20'
                      : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  Confirm {selectedAction === 'delete' ? 'Deletion' : selectedAction === 'centralize' ? 'Centralization' : 'Removal'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="pt-6 border-t border-slate-800">
          <button
            onClick={onClose}
            className="w-full py-4 rounded-2xl text-slate-500 font-black text-xs uppercase hover:text-white transition-all"
          >
            Cancel All
          </button>
        </div>
      </div>
    </div>
  );
}
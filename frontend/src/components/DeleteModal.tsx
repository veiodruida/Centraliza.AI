import { useState } from 'react';
import { Trash2, Zap, X, AlertTriangle, Link2Off } from 'lucide-react';

export interface ModelItem {
  name: string;
  path: string;
  isSymlink: boolean;
  source?: string;
  size?: number;
  finalModelName?: string;
  ollamaTag?: string;
}

interface DeleteModalProps {
  isOpen: boolean;
  models: ModelItem[];
  onClose: () => void;
  onConfirm: (action: 'delete' | 'decentralize' | 'centralize') => void;
}

export default function DeleteModal({ isOpen, models, onClose, onConfirm }: DeleteModalProps) {
  const [selectedAction, setSelectedAction] = useState<'delete' | 'decentralize' | 'centralize' | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);

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
      
      <div className="relative bg-slate-900 border border-slate-800 rounded-[3rem] p-10 w-[500px] max-w-[90vw] shadow-2xl animate-in zoom-in-95 duration-200">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <div className="flex items-center gap-4 mb-8">
          <div className="p-4 bg-red-500/10 rounded-2xl text-red-500">
            <AlertTriangle size={32} />
          </div>
          <div>
            <h3 className="text-2xl font-black text-white">
              {isSingle ? `Gerenciar "${model.name}"` : `${models.length} modelos selecionados`}
            </h3>
            <p className="text-slate-500 text-sm mt-1">
              Escolha uma ação para prosseguir
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
                  className="w-full p-6 rounded-2xl border border-slate-800 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all flex items-center gap-4 text-left"
                >
                  <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                    <Zap size={24} />
                  </div>
                  <div>
                    <span className="text-white font-black text-sm block">Centralizar Modelo{models.length > 1 ? 's' : ''}</span>
                    <span className="text-slate-500 text-[10px] leading-tight block mt-1">
                      Mover arquivos para a pasta central e criar atalhos. Economiza espaço e organiza seus modelos.
                    </span>
                  </div>
                </button>
              )}

              {/* Option 2: Decentralize (for symlinks) */}
              {hasSymlinks && (
                <button
                  onClick={() => setSelectedAction('decentralize')}
                  className="w-full p-6 rounded-2xl border border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex items-center gap-4 text-left"
                >
                  <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
                    <Link2Off size={24} />
                  </div>
                  <div>
                    <span className="text-white font-black text-sm block">Descentralizar / Remover Atalho</span>
                    <span className="text-slate-500 text-[10px] leading-tight block mt-1">
                      Remove apenas a ligação na pasta central. O arquivo original no provedor (Ollama, ComfyUI, etc) permanecerá intacto.
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
                    Excluir Permanentemente
                  </span>
                  <span className="text-slate-500 text-[10px] leading-tight block mt-1">
                    APAGA os arquivos físicos do disco. Esta ação é irreversível e removerá tanto o atalho quanto o original.
                  </span>
                </div>
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-800">
                <p className="text-slate-400 text-xs leading-relaxed">
                  {selectedAction === 'delete' ? (
                    'ATENÇÃO: Você está prestes a excluir permanentemente os arquivos selecionados. Isso não pode ser desfeito.'
                  ) : selectedAction === 'centralize' ? (
                    'Os modelos serão movidos para a pasta de centralização configurada e substituídos por atalhos no local original.'
                  ) : (
                    'Apenas as referências na pasta central serão removidas. Os arquivos originais nos diretórios dos provedores não serão afetados.'
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
                  Estou ciente e desejo prosseguir
                </label>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setSelectedAction(null); setConfirmChecked(false); }}
                  className="flex-1 py-4 rounded-2xl border border-slate-800 text-slate-400 font-black text-xs uppercase hover:bg-slate-800 transition-all"
                >
                  Voltar
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
                  Confirmar {selectedAction === 'delete' ? 'Exclusão' : selectedAction === 'centralize' ? 'Centralização' : 'Remoção'}
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
            Cancelar Tudo
          </button>
        </div>
      </div>
    </div>
  );
}
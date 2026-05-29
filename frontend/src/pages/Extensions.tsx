import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
// Importação fictícia baseada no guia arquitetural de internacionalização
// import { useApp } from '../context/AppContext';

export default function Extensions() {
  // const { t } = useApp();
  const [loadingContinue, setLoadingContinue] = useState(false);
  const [rooInstructions, setRooInstructions] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleSetupContinue = async () => {
    setLoadingContinue(true);
    try {
      const res = await fetch('/api/coder/setup-continue', { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        // Dispara a URI de instalação para "acordar" o VS Code
        window.location.href = data.installUri;
        // TODO: Substituir por Toast do Design System (ex: Toast.success(data.message))
        alert(data.message); 
      } else {
        alert('Erro: ' + data.error);
      }
    } catch (error: any) {
      alert('Falha na comunicação: ' + error.message);
    } finally {
      setLoadingContinue(false);
    }
  };

  const handleSetupRoo = async () => {
    try {
      const res = await fetch('/api/coder/setup-roo');
      const data = await res.json();
      
      if (data.success) {
        // Exibe o painel de instruções de cópia e inicia a instalação
        setRooInstructions(data.instructions);
        window.location.href = data.installUri;
      }
    } catch (error: any) {
      alert('Falha na comunicação: ' + error.message);
    }
  };

  const handleCopyRoo = () => {
    if (!rooInstructions) return;
    const text = `API Provider: ${rooInstructions.apiProvider}\nBase URL: ${rooInstructions.baseUrl}\nAPI Key: ${rooInstructions.apiKey}\nModel ID: ${rooInstructions.modelId}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 md:p-10 space-y-8 text-[var(--text-primary)]">
      <div>
        <h1 className="text-3xl font-black uppercase tracking-widest">Extensões & Integrações</h1>
        <p className="text-[var(--text-muted)] mt-2">
          Conecte o Centraliza.ai ao seu editor de código favorito com apenas um clique.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card: Continue.dev */}
        <div className="bg-[var(--bg-surface)] p-6 rounded-2xl border border-[var(--border)] backdrop-blur-xl shadow-xl hover:border-blue-500/30 transition-all duration-300 group">
          <h2 className="text-xl font-bold mb-2">Continue.dev</h2>
          <p className="text-[var(--text-secondary)] text-sm mb-6 min-h-[60px]">
            Autocompletar de código em tempo real e chat diretamente no VS Code. O Centraliza injeta a configuração automaticamente.
          </p>
          <button 
            onClick={handleSetupContinue} 
            disabled={loadingContinue}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl transition-all duration-300 active:scale-95 disabled:opacity-50"
          >
            {loadingContinue ? 'Configurando...' : 'Integrar com Continue.dev'}
          </button>
        </div>

        {/* Card: Roo Code */}
        <div className="bg-[var(--bg-surface)] p-6 rounded-2xl border border-[var(--border)] backdrop-blur-xl shadow-xl hover:border-purple-500/30 transition-all duration-300 group">
          <h2 className="text-xl font-bold mb-2">Roo Code (Cline)</h2>
          <p className="text-[var(--text-secondary)] text-sm mb-6 min-h-[60px]">
            Agente autônomo visual que lê arquivos e edita código em massa com aprovação interativa.
          </p>
          <button 
            onClick={handleSetupRoo} 
            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-4 rounded-xl transition-all duration-300 active:scale-95"
          >
            Instalar Roo Code
          </button>
        </div>
      </div>

      {/* Instruções Dinâmicas do Roo Code */}
      {rooInstructions && (
        <div className="mt-8 bg-[var(--bg-surface)] p-6 rounded-2xl border border-purple-500/50 shadow-xl shadow-purple-500/10 transition-all duration-500 relative">
          <button 
            onClick={handleCopyRoo}
            className="absolute top-6 right-6 p-2 bg-[var(--bg-input)] hover:bg-purple-500/20 text-[var(--text-muted)] hover:text-purple-400 rounded-xl transition-all border border-[var(--border)] active:scale-95"
            title="Copiar instruções"
          >
            {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
          </button>
          <h3 className="text-lg font-bold text-purple-400 mb-4 pr-12">Configuração do Roo Code</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-4">Cole os valores abaixo nas configurações do provedor de API dentro da extensão:</p>
          <ul className="space-y-3 text-sm font-mono bg-[var(--bg-input)] p-4 rounded-xl border border-[var(--border)]">
            <li><strong className="text-purple-300">API Provider:</strong> {rooInstructions.apiProvider}</li>
            <li><strong className="text-purple-300">Base URL:</strong> {rooInstructions.baseUrl}</li>
            <li><strong className="text-purple-300">API Key:</strong> {rooInstructions.apiKey}</li>
            <li><strong className="text-purple-300">Model ID:</strong> {rooInstructions.modelId}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
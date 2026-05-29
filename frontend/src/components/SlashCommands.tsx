
export const COMMANDS = [
    { command: '/gsd', description: 'Get Shit Done - Respostas diretas e código focado' },
    { command: '/clear', description: 'Limpa o histórico de chat' },
    { command: '/compact', description: 'Compacta o histórico para poupar memória' },
    { command: '/attach', description: 'Abre o menu de upload de ficheiros/PDFs' },
    { command: '/info', description: 'Mostra as informações do modelo e do motor atual' },
    { command: '/ajuda', description: 'Exibe a lista de comandos e instruções de uso' },
    { command: '/context', description: 'Abre as configurações para ajustar a memória (tokens)' }
];

interface SlashCommandsProps {
    input: string;
    onSelect: (command: string) => void;
}

export default function SlashCommands({ input, onSelect }: SlashCommandsProps) {
    if (!input.startsWith('/')) return null;
    
    const filtered = COMMANDS.filter(c => c.command.startsWith(input.toLowerCase()));
    if (filtered.length === 0) return null;

    return (
        <div className="absolute bottom-full left-0 mb-3 w-80 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl z-50 animate-fade-in">
            <div className="px-4 py-2 bg-[var(--bg-input)] border-b border-[var(--border)] text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">
                Comandos Disponíveis
            </div>
            {filtered.map((cmd) => (
                <button
                    key={cmd.command}
                    onClick={() => onSelect(cmd.command)}
                    className="w-full text-left px-4 py-3 hover:bg-blue-500/10 hover:text-blue-500 transition-colors border-b border-[var(--border)] last:border-0 flex flex-col group"
                >
                    <span className="font-bold font-mono text-sm text-[var(--text-primary)] group-hover:text-blue-500">{cmd.command}</span>
                    <span className="text-xs text-[var(--text-muted)] mt-0.5">{cmd.description}</span>
                </button>
            ))}
        </div>
    );
}
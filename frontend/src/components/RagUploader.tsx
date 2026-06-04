import React, { useState, useEffect } from 'react';
import { X, Loader2, FileText } from 'lucide-react';

export default function RagUploader() {
    const [documents, setDocuments] = useState<any[]>([]);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        fetch('/api/documents')
            .then(res => res.json())
            .then(data => setDocuments(data));
    }, []);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        
        setUploading(true);
        const formData = new FormData();
        formData.append('document', e.target.files[0]);

        try {
            const res = await fetch('/api/documents/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                setDocuments([...documents, data.document]);
            } else {
                alert(data.error);
            }
        } catch (err) {
            alert('Erro no upload: ' + err);
        } finally {
            setUploading(false);
        }
    };

    const handleRemove = async (id: number) => {
        await fetch(`/api/documents/${id}`, { method: 'DELETE' });
        setDocuments(documents.filter(d => d.id !== id));
    };

    return (
        <div className="flex flex-wrap items-center gap-2 mb-3">
            {documents.map(doc => (
                <div key={doc.id} className="flex items-center gap-2 bg-blue-500/10 text-blue-500 px-3 py-1.5 rounded-xl border border-blue-500/20 text-xs font-bold shadow-sm">
                    <FileText size={14} />
                    <span className="truncate max-w-[150px]" title={doc.filename}>{doc.filename}</span>
                    <button onClick={() => handleRemove(doc.id)} className="hover:text-red-500 hover:bg-red-500/10 p-1 rounded-md transition-colors ml-1">
                        <X size={14} />
                    </button>
                </div>
            ))}
            
            <label className="cursor-pointer flex items-center justify-center p-2.5 bg-[var(--bg-input)] hover:bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl text-[var(--text-muted)] hover:text-blue-500 transition-colors active:scale-95 shadow-sm" title="Anexar PDF, DOCX ou TXT">
                {uploading ? <Loader2 size={18} className="animate-spin text-blue-500" /> : <FileText size={18} />}
                <input type="file" className="hidden" accept=".pdf,.txt,.docx" onChange={handleUpload} disabled={uploading || documents.length >= 5} />
            </label>
        </div>
    );
}
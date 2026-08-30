const fs = require('fs');
let content = fs.readFileSync('src/components/ConfiguracoesView.tsx', 'utf-8');

const importReplacement = `import React, { useState, useRef } from 'react';\nimport { Download, CheckSquare, Square, Loader2, Database, CheckCircle2, Upload, AlertTriangle, FileUp, X } from 'lucide-react';\n`;
content = content.replace(`import React, { useState } from 'react';\nimport { Download, CheckSquare, Square, Loader2, Database, CheckCircle2 } from 'lucide-react';`, importReplacement);

const statesReplacement = `  const [inspectFile, setInspectFile] = useState<File | null>(null);
  const [inspectResult, setInspectResult] = useState<any>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setInspectFile(file);
    setInspectResult(null);
    setError(null);
    setSuccess(null);
    setRestoreConfirmed(false);
    
    const formData = new FormData();
    formData.append('backup', file);
    
    setIsInspecting(true);
    try {
      const res = await fetch('/api/backups/inspect', {
        method: 'POST',
        headers: { 'Authorization': \`Bearer \${localStorage.getItem('token')}\` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao inspecionar backup.');
      setInspectResult(data);
    } catch (err: any) {
      setError(err.message);
      setInspectFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setIsInspecting(false);
    }
  };

  const handleRestore = async () => {
    if (!inspectFile || !restoreConfirmed) return;
    setError(null);
    setSuccess(null);
    setIsRestoring(true);
    setShowRestoreModal(false);

    const formData = new FormData();
    formData.append('backup', inspectFile);
    formData.append('confirm', 'RESTORE');

    try {
      const res = await fetch('/api/backups/restore', {
        method: 'POST',
        headers: { 'Authorization': \`Bearer \${localStorage.getItem('token')}\` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao restaurar backup.');
      setSuccess('Backup restaurado com sucesso. Recarregando...');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRestoring(false);
    }
  };
`;
content = content.replace(`  const [error, setError] = useState<string | null>(null);`, `  const [error, setError] = useState<string | null>(null);\n${statesReplacement}`);

const oldDivRegex = /<div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">[\s\S]*?Sobre Restauração[\s\S]*?<\/div>/;

const restoreBlock = `
          {/* RESTAURAÇÃO */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 to-orange-500 opacity-20" />
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                <Upload className="w-4 h-4 text-rose-400" />
              </div>
              <h3 className="font-semibold text-white">Restaurar Backup Completo</h3>
            </div>
            
            <p className="text-sm text-neutral-400 mb-6">
              Restaura todos os dados persistidos da conta para o estado salvo no backup.
              Apenas backups completos (full) são suportados.
            </p>

            <div className="flex flex-col gap-4">
              <input
                type="file"
                accept=".nczbackup"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                id="backup-upload"
              />
              <label 
                htmlFor="backup-upload" 
                className="flex items-center justify-center gap-2 h-10 w-full rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sm font-medium text-white cursor-pointer transition-colors border border-neutral-700"
              >
                {isInspecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                {isInspecting ? 'Inspecionando...' : inspectFile ? 'Trocar Arquivo' : 'Selecionar Arquivo'}
              </label>

              {inspectResult && (
                <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-neutral-800 text-sm">
                    <span className="text-neutral-400">Versão Backup</span>
                    <span className="text-white font-medium">{inspectResult.manifest.appVersion}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <div className="flex flex-col"><span className="text-neutral-500 text-xs">Instâncias</span><span className="text-neutral-300">{inspectResult.counts.instances}</span></div>
                    <div className="flex flex-col"><span className="text-neutral-500 text-xs">Templates</span><span className="text-neutral-300">{inspectResult.counts.templates}</span></div>
                    <div className="flex flex-col"><span className="text-neutral-500 text-xs">Agendamentos</span><span className="text-neutral-300">{inspectResult.counts.schedules}</span></div>
                    <div className="flex flex-col"><span className="text-neutral-500 text-xs">Campanhas</span><span className="text-neutral-300">{inspectResult.counts.campaigns}</span></div>
                    <div className="flex flex-col"><span className="text-neutral-500 text-xs">Histórico</span><span className="text-neutral-300">{inspectResult.counts.campaignHistory}</span></div>
                    <div className="flex flex-col"><span className="text-neutral-500 text-xs">Automações</span><span className="text-neutral-300">{inspectResult.counts.automations}</span></div>
                    <div className="flex flex-col"><span className="text-neutral-500 text-xs">Fluxos</span><span className="text-neutral-300">{inspectResult.counts.flows}</span></div>
                    <div className="flex flex-col"><span className="text-neutral-500 text-xs">Arquivos</span><span className="text-neutral-300">{inspectResult.counts.files}</span></div>
                  </div>
                  
                  {inspectResult.warnings?.length > 0 && (
                    <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                         <AlertTriangle className="w-4 h-4 text-amber-500" />
                         <span className="text-xs font-semibold text-amber-500">Avisos</span>
                      </div>
                      <ul className="text-xs text-amber-400/90 list-disc pl-4 space-y-1">
                        {inspectResult.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}

                  <label className="flex items-start gap-3 mt-4 cursor-pointer group">
                    <div className="relative flex items-center justify-center w-5 h-5 mt-0.5">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={restoreConfirmed}
                        onChange={(e) => setRestoreConfirmed(e.target.checked)}
                      />
                      <div className="w-5 h-5 rounded-md border border-neutral-700 bg-neutral-900 peer-checked:bg-rose-500 peer-checked:border-rose-500 transition-colors" />
                      <CheckSquare className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                    </div>
                    <span className="text-sm text-neutral-400 group-hover:text-neutral-300 transition-colors leading-snug">
                      Entendo que os dados atuais da conta serão substituídos pelos dados deste backup.
                    </span>
                  </label>

                  <Button 
                    variant="danger" 
                    className="w-full mt-4 h-10"
                    disabled={!restoreConfirmed || isRestoring}
                    onClick={() => setShowRestoreModal(true)}
                  >
                    {isRestoring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    {isRestoring ? 'Restaurando...' : 'Restaurar Backup Completo'}
                  </Button>
                </div>
              )}
            </div>
          </div>

      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-md w-full shadow-xl">
             <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                  <AlertTriangle className="w-5 h-5 text-rose-500" />
                </div>
                <button onClick={() => setShowRestoreModal(false)} className="text-neutral-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
             </div>
             <h3 className="text-lg font-semibold text-white mb-2">Confirmar Restauração</h3>
             <p className="text-sm text-neutral-400 mb-6">
                Esta operação substituirá os dados atuais da sua conta pelo conteúdo do backup selecionado. 
                Isso não pode ser desfeito. Deseja prosseguir?
             </p>
             <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowRestoreModal(false)}>
                  Cancelar
                </Button>
                <Button variant="danger" onClick={handleRestore}>
                  Restaurar
                </Button>
             </div>
          </div>
        </div>
      )}
`;
content = content.replace(oldDivRegex, restoreBlock);

fs.writeFileSync('src/components/ConfiguracoesView.tsx', content);

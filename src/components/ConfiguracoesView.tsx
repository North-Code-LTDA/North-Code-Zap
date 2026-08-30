import React, { useState } from 'react';
import { Download, CheckSquare, Square, Loader2, Database, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/Button';

export function ConfiguracoesView() {
  const [isExportingFull, setIsExportingFull] = useState(false);
  const [isExportingSelective, setIsExportingSelective] = useState(false);
  
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const selectableScopes = [
    { id: 'auth', label: 'Conta e autenticação' },
    { id: 'instances', label: 'Instâncias e sessões WhatsApp' },
    { id: 'contacts', label: 'Contatos, Tags e Listas' },
    { id: 'media', label: 'Mídias' },
    { id: 'templates', label: 'Templates' },
    { id: 'schedules', label: 'Agendamentos' },
    { id: 'campaigns', label: 'Campanhas e Histórico' },
    { id: 'automations', label: 'Automações' },
    { id: 'flows', label: 'Fluxos' }
  ];

  const handleToggleScope = (id: string) => {
    const next = new Set(selectedScopes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedScopes(next);
  };

  const handleDownload = async (mode: 'full' | 'selective') => {
    if (mode === 'selective' && selectedScopes.size === 0) return;
    
    setError(null);
    setSuccess(null);
    
    if (mode === 'full') setIsExportingFull(true);
    else setIsExportingSelective(true);
    
    try {
      const payload = mode === 'full' 
        ? { mode: 'full' }
        : { mode: 'selective', scopes: Array.from(selectedScopes) };
        
      const response = await fetch('/api/backups/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Falha ao exportar backup');
      }
      
      let filename = 'north-code-zap-backup.nczbackup';
      const disposition = response.headers.get('Content-Disposition');
      if (disposition && disposition.indexOf('filename=') !== -1) {
        const matches = /filename="([^"]*)"/.exec(disposition);
        if (matches != null && matches[1]) filename = matches[1];
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      
      setSuccess('Backup gerado e download iniciado.');
      
    } catch (e: any) {
      console.error('Backup error:', e);
      setError(e.message || 'Erro ao processar backup');
      setSuccess(null);
    } finally {
      if (mode === 'full') setIsExportingFull(false);
      else setIsExportingSelective(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-neutral-950 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <header>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center border border-neutral-800">
              <Database className="w-5 h-5 text-neutral-400" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Configurações</h1>
          </div>
          <p className="text-neutral-400">Gerencie preferências do sistema e exportação de dados.</p>
        </header>

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {success}
          </div>
        )}

        <section className="space-y-6">
          <div className="border-b border-neutral-800 pb-4">
            <h2 className="text-lg font-semibold text-white">Backup e Restauração</h2>
            <p className="text-sm text-neutral-400 mt-1">Exporte seus dados persistidos para arquivamento ou migração.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            
            {/* Backup Completo */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-20" />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Database className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="font-semibold text-white">Backup Completo</h3>
              </div>
              
              <p className="text-sm text-neutral-400 mb-6 flex-1">
                Baixa todos os dados persistidos da sua conta, incluindo instâncias, sessões, contatos, mídias, agendamentos, campanhas, automações e fluxos.
              </p>
              
              <Button 
                variant="primary" 
                className="w-full h-10 justify-center bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                onClick={() => handleDownload('full')}
                disabled={isExportingFull || isExportingSelective}
              >
                {isExportingFull ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                {isExportingFull ? 'Gerando Backup...' : 'Baixar Backup Completo'}
              </Button>
            </div>

            {/* Backup Seletivo */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-20" />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Database className="w-4 h-4 text-blue-400" />
                </div>
                <h3 className="font-semibold text-white">Backup Seletivo</h3>
              </div>
              
              <div className="space-y-1 mb-6 flex-1 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {selectableScopes.map(scope => {
                  const isSelected = selectedScopes.has(scope.id);
                  return (
                    <button
                      key={scope.id}
                      type="button"
                      onClick={() => handleToggleScope(scope.id)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-800/50 transition-colors text-left"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-neutral-500 shrink-0" />
                      )}
                      <span className={'text-sm ' + (isSelected ? 'text-white' : 'text-neutral-400')}>
                        {scope.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              
              <Button 
                variant="primary" 
                className="w-full h-10 justify-center bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20 disabled:opacity-50"
                onClick={() => handleDownload('selective')}
                disabled={isExportingFull || isExportingSelective || selectedScopes.size === 0}
              >
                {isExportingSelective ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                {isExportingSelective ? 'Gerando Backup...' : 'Baixar Backup Selecionado'}
              </Button>
            </div>
            
          </div>
          
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <h3 className="text-sm font-medium text-white mb-2">Sobre Restauração</h3>
            <p className="text-sm text-neutral-400">
              Restauração de backup será disponibilizada após a validação do formato de backup. No momento, esta ferramenta opera apenas em modo de leitura (exportação).
            </p>
          </div>

        </section>
      </div>
    </div>
  );
}

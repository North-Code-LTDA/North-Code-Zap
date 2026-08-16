import { Terminal, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';

interface DiagnosticLogsProps {
  logs: Array<{ id: string; time: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }>;
}

export function DiagnosticLogs({ logs }: DiagnosticLogsProps) {
  return (
    <div className="w-full bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-lg" id="diagnostic-logs-card">
      <div className="flex items-center justify-between px-4 py-3 bg-neutral-950/80 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-mono font-medium text-neutral-300">
            Console de Diagnóstico em Tempo Real
          </span>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-neutral-800 text-neutral-400">
          {logs.length} eventos
        </span>
      </div>

      <div className="p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-1.5 scrollbar-thin scrollbar-thumb-neutral-700">
        {logs.length === 0 ? (
          <div className="text-neutral-500 italic py-2 text-center">
            Aguardando eventos do sistema...
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 leading-relaxed">
              <span className="text-neutral-500 select-none text-[11px] shrink-0">{log.time}</span>
              {log.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />}
              {log.type === 'warn' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />}
              {log.type === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />}
              {log.type === 'info' && <Info className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />}
              <span
                className={`break-all ${
                  log.type === 'success'
                    ? 'text-emerald-300 font-medium'
                    : log.type === 'warn'
                    ? 'text-amber-300'
                    : log.type === 'error'
                    ? 'text-rose-400'
                    : 'text-neutral-300'
                }`}
              >
                {log.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

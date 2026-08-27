import React, { useState, useMemo, useEffect } from 'react';
import { 
  Layers, Plus, Search, Edit3, Trash2, X, Play, Pause, 
  MessageSquare, FileText, AlertTriangle, Users, Tag,
  Clock, ArrowUp, ArrowDown, Shuffle, Zap
} from 'lucide-react';
import { useFlows } from '../hooks/useFlows';
import { useAudiences } from '../hooks/useAudiences';
import { useTemplates } from '../hooks/useTemplates';
import { Button } from './ui/Button';
import type { Flow, FlowStep, FlowTrigger, FlowCondition } from '../types';
import { renderMessageTemplate } from '../utils/template';

interface FluxosViewProps {
  selectedInstanceId: string | null;
}

const STEP_ICONS: Record<string, React.ReactNode> = {
  send_message: <MessageSquare className="w-4 h-4 text-emerald-400" />,
  delay: <Clock className="w-4 h-4 text-amber-400" />,
  condition: <Shuffle className="w-4 h-4 text-purple-400" />,
  add_tag: <Tag className="w-4 h-4 text-blue-400" />,
  remove_tag: <Tag className="w-4 h-4 text-rose-400" />,
  add_to_list: <Users className="w-4 h-4 text-emerald-400" />,
  remove_from_list: <Users className="w-4 h-4 text-rose-400" />
};

const STEP_NAMES: Record<string, string> = {
  send_message: 'Enviar Mensagem',
  delay: 'Atraso (Espera)',
  condition: 'Condição (Se/Senão)',
  add_tag: 'Adicionar Tag',
  remove_tag: 'Remover Tag',
  add_to_list: 'Adicionar à Lista',
  remove_from_list: 'Remover da Lista'
};

export function FluxosView({ selectedInstanceId }: FluxosViewProps) {
  const { flows, loading, error, createFlow, updateFlow, deleteFlow } = useFlows(selectedInstanceId);
  const { state: audienceState } = useAudiences(selectedInstanceId);
  const lists = audienceState?.lists || [];
  const tags = audienceState?.tags || [];
  const { templates } = useTemplates();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formTriggerType, setFormTriggerType] = useState<'contact_added_to_list' | 'tag_added_to_contact'>('contact_added_to_list');
  const [formTriggerResource, setFormTriggerResource] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formSteps, setFormSteps] = useState<FlowStep[]>([]);
  
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
  const [templateConfirmation, setTemplateConfirmation] = useState<{ stepId: string, templateId: string } | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const resetErrors = () => {
    setFormError(null);
    setActionError(null);
    setDeleteError(null);
  };

  useEffect(() => {
    setIsModalOpen(false);
    setEditingId(null);
    setDeleteConfirmation(null);
    setTemplateConfirmation(null);
    resetErrors();
  }, [selectedInstanceId]);

  useEffect(() => {
    if (!isModalOpen && !deleteConfirmation && !templateConfirmation) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isModalOpen, deleteConfirmation, templateConfirmation]);

  const metrics = useMemo(() => {
    const total = flows.length;
    const active = flows.filter(f => f.enabled).length;
    const paused = total - active;
    return { total, active, paused };
  }, [flows]);

  const filteredFlows = useMemo(() => {
    const s = search.toLowerCase();
    if (!s) return flows;
    return flows.filter(f => {
      if (f.name.toLowerCase().includes(s)) return true;
      if (f.trigger.type === 'contact_added_to_list') {
        const l = lists.find(list => list.id === (f.trigger as any).listId);
        if (l && l.name.toLowerCase().includes(s)) return true;
      }
      if (f.trigger.type === 'tag_added_to_contact') {
        const t = tags.find(tag => tag.id === (f.trigger as any).tagId);
        if (t && t.name.toLowerCase().includes(s)) return true;
      }
      const stepsStr = JSON.stringify(f.steps).toLowerCase();
      if (stepsStr.includes(s)) return true;
      return false;
    });
  }, [flows, search, lists, tags]);

  const openNew = () => {
    resetErrors();
    setFormName('');
    setFormTriggerType('contact_added_to_list');
    setFormTriggerResource('');
    setFormEnabled(true);
    setFormSteps([]);
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEdit = (f: Flow) => {
    resetErrors();
    setFormName(f.name);
    setFormTriggerType(f.trigger.type);
    setFormTriggerResource(
      f.trigger.type === 'contact_added_to_list' ? (f.trigger as any).listId : (f.trigger as any).tagId
    );
    setFormEnabled(f.enabled);
    setFormSteps(structuredClone(f.steps));
    setEditingId(f.id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetErrors();
  };

  const toggleEnabled = async (f: Flow) => {
    setActionError(null);
    try {
      await updateFlow(f.id, { enabled: !f.enabled });
    } catch (err: any) {
      setActionError(err.message || 'Erro ao alterar status');
    }
  };

  const openDelete = (id: string) => {
    resetErrors();
    setDeleteConfirmation(id);
  };

  const handleDelete = async () => {
    if (!deleteConfirmation) return;
    setDeleteError(null);
    try {
      await deleteFlow(deleteConfirmation);
      setDeleteConfirmation(null);
    } catch (err: any) {
      setDeleteError(err.message || 'Erro ao excluir fluxo');
    }
  };

  const countSteps = (steps: FlowStep[]): number => {
    let c = 0;
    for (const s of steps) {
      c++;
      if (s.type === 'condition') {
        c += countSteps(s.ifTrue);
        c += countSteps(s.ifFalse);
      }
    }
    return c;
  };

  const updateStepInTree = (steps: FlowStep[], id: string, updater: (step: FlowStep) => FlowStep | null): FlowStep[] => {
    return steps.map(s => {
      if (s.id === id) {
        return updater(s);
      }
      if (s.type === 'condition') {
        return {
          ...s,
          ifTrue: updateStepInTree(s.ifTrue, id, updater) as FlowStep[],
          ifFalse: updateStepInTree(s.ifFalse, id, updater) as FlowStep[]
        };
      }
      return s;
    }).filter(Boolean) as FlowStep[];
  };

  const findAndMove = (steps: FlowStep[], id: string, direction: 'up' | 'down'): { changed: boolean, result: FlowStep[] } => {
    const idx = steps.findIndex(s => s.id === id);
    if (idx !== -1) {
      if (direction === 'up' && idx > 0) {
        const copy = [...steps];
        [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
        return { changed: true, result: copy };
      }
      if (direction === 'down' && idx < steps.length - 1) {
        const copy = [...steps];
        [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
        return { changed: true, result: copy };
      }
      return { changed: false, result: steps };
    }
    let anyChanged = false;
    const newSteps = steps.map(s => {
      if (s.type === 'condition') {
        const rTrue = findAndMove(s.ifTrue, id, direction);
        const rFalse = findAndMove(s.ifFalse, id, direction);
        if (rTrue.changed || rFalse.changed) anyChanged = true;
        return { ...s, ifTrue: rTrue.result, ifFalse: rFalse.result };
      }
      return s;
    });
    return { changed: anyChanged, result: newSteps };
  };

  const moveStep = (id: string, direction: 'up' | 'down') => {
    setFormSteps(prev => findAndMove(prev, id, direction).result);
  };

  const deleteStep = (id: string) => {
    setFormSteps(prev => updateStepInTree(prev, id, () => null));
  };

  const addStep = (targetParentId: string | null, branch: 'true' | 'false' | null, type: string) => {
    if (countSteps(formSteps) >= 50) {
      setFormError('Limite de 50 passos alcançado.');
      return;
    }

    const newStep = { id: crypto.randomUUID(), type } as any;
    if (type === 'send_message') {
      newStep.message = '';
      newStep.fallbackName = 'amigo(a)';
    } else if (type === 'delay') {
      newStep.durationSeconds = 60; // default 1 min
    } else if (type === 'condition') {
      newStep.condition = { type: 'has_tag', tagId: '' };
      newStep.ifTrue = [];
      newStep.ifFalse = [];
    } else if (['add_tag', 'remove_tag'].includes(type)) {
      newStep.tagId = '';
    } else if (['add_to_list', 'remove_from_list'].includes(type)) {
      newStep.listId = '';
    }

    if (!targetParentId) {
      setFormSteps(prev => [...prev, newStep]);
      return;
    }

    setFormSteps(prev => updateStepInTree(prev, targetParentId, step => {
      if (step.type === 'condition') {
        return {
          ...step,
          ifTrue: branch === 'true' ? [...step.ifTrue, newStep] : step.ifTrue,
          ifFalse: branch === 'false' ? [...step.ifFalse, newStep] : step.ifFalse,
        };
      }
      return step;
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim() || !formTriggerResource || formSteps.length === 0) {
      setFormError('Preencha todos os campos e adicione pelo menos um passo.');
      return;
    }

    const trigger: FlowTrigger = formTriggerType === 'contact_added_to_list'
      ? { type: 'contact_added_to_list', listId: formTriggerResource }
      : { type: 'tag_added_to_contact', tagId: formTriggerResource };

    try {
      if (editingId) {
        await updateFlow(editingId, {
          name: formName,
          enabled: formEnabled,
          trigger,
          steps: formSteps
        });
      } else {
        await createFlow({
          name: formName,
          enabled: formEnabled,
          trigger,
          steps: formSteps
        });
      }
      closeModal();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar fluxo');
    }
  };

  const insertVariable = (stepId: string, variable: string) => {
    setFormSteps(prev => updateStepInTree(prev, stepId, step => {
      if (step.type === 'send_message') {
        const textarea = document.getElementById(`textarea-${step.id}`) as HTMLTextAreaElement | null;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const msg = step.message || '';
          const newMsg = msg.substring(0, start) + variable + msg.substring(end);
          
          setTimeout(() => {
             const ta = document.getElementById(`textarea-${step.id}`) as HTMLTextAreaElement;
             if (ta) { ta.focus(); ta.setSelectionRange(start + variable.length, start + variable.length); }
          }, 0);
          
          return { ...step, message: newMsg };
        }
        return { ...step, message: step.message + variable };
      }
      return step;
    }));
  };

  const applyTemplate = (stepId: string, templateId: string) => {
    const t = templates.find(x => x.id === templateId);
    if (!t) return;
    
    // Auto apply se message empty
    let isEmpty = false;
    setFormSteps(prev => {
      let foundEmpty = false;
      const copy = updateStepInTree(prev, stepId, step => {
        if (step.type === 'send_message') {
          if (!step.message.trim()) {
            foundEmpty = true;
          }
        }
        return step;
      });
      isEmpty = foundEmpty;
      return prev;
    });

    if (isEmpty) {
      setFormSteps(prev => updateStepInTree(prev, stepId, step => {
        if (step.type === 'send_message') {
          return { ...step, message: t.message, fallbackName: t.fallbackName };
        }
        return step;
      }));
    } else {
      setTemplateConfirmation({ stepId, templateId });
    }
  };

  const confirmApplyTemplate = () => {
    if (!templateConfirmation) return;
    const { stepId, templateId } = templateConfirmation;
    const t = templates.find(x => x.id === templateId);
    if (t) {
      setFormSteps(prev => updateStepInTree(prev, stepId, step => {
        if (step.type === 'send_message') {
          return { ...step, message: t.message, fallbackName: t.fallbackName };
        }
        return step;
      }));
    }
    setTemplateConfirmation(null);
  };

  // Sub-componentes para o modal

  const AddStepUI = ({ onAdd, depth }: { onAdd: (type: string) => void, depth: number }) => {
    const [open, setOpen] = useState(false);
    if (!open) {
      return (
        <button 
          type="button" 
          onClick={() => setOpen(true)}
          className="w-full py-3 border-2 border-dashed border-neutral-700 hover:border-emerald-500/50 rounded-xl text-neutral-400 hover:text-emerald-400 flex items-center justify-center gap-2 transition-colors font-medium text-sm"
        >
          <Plus className="w-4 h-4" /> Adicionar Passo
        </button>
      );
    }
    return (
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl space-y-3">
        <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Escolha o tipo de passo:</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(STEP_NAMES).map(([type, name]) => {
            const disabled = type === 'condition' && depth >= 5;
            return (
              <button
                key={type}
                type="button"
                disabled={disabled}
                onClick={() => { onAdd(type); setOpen(false); }}
                className={`flex items-center gap-3 p-3 rounded-lg border text-sm text-left transition-colors ${
                  disabled 
                    ? 'bg-neutral-950/50 border-neutral-800/50 text-neutral-600 cursor-not-allowed'
                    : 'bg-neutral-950 border-neutral-800 hover:border-emerald-500/50 hover:bg-neutral-800 text-neutral-200'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${disabled ? 'bg-neutral-900/50' : 'bg-neutral-900'}`}>
                  {STEP_ICONS[type]}
                </div>
                <div className="flex flex-col">
                  <span className="font-medium">{name}</span>
                  {disabled && <span className="text-[10px] text-neutral-600">Limite de profundidade atingido</span>}
                </div>
              </button>
            );
          })}
        </div>
        <button 
          type="button" 
          onClick={() => setOpen(false)}
          className="w-full py-2 mt-2 text-sm text-neutral-500 hover:text-white transition-colors"
        >
          Cancelar
        </button>
      </div>
    );
  };

  const renderStepList = (steps: FlowStep[], parentId: string | null, branch: 'true' | 'false' | null, depth = 1) => {
    return (
      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={step.id} className="relative">
            {/* Linha vertical conectora */}
            {index > 0 && (
              <div className="absolute -top-4 left-6 w-0.5 h-4 bg-neutral-800"></div>
            )}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-neutral-950/50 px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0">
                    {STEP_ICONS[step.type]}
                  </div>
                  <span className="text-sm font-bold text-white">{STEP_NAMES[step.type]}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Mover para cima" onClick={() => moveStep(step.id, 'up')} disabled={index === 0} className="p-1.5 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded disabled:opacity-30 disabled:hover:bg-transparent">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" aria-label="Mover para baixo" onClick={() => moveStep(step.id, 'down')} disabled={index === steps.length - 1} className="p-1.5 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded disabled:opacity-30 disabled:hover:bg-transparent">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-px h-4 bg-neutral-800 mx-1"></div>
                  <button type="button" aria-label="Excluir passo" onClick={() => deleteStep(step.id)} className="p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="p-4">
                {renderStepBody(step, depth)}
              </div>
            </div>
          </div>
        ))}
        <div className="relative pt-2">
          {steps.length > 0 && (
            <div className="absolute -top-2 left-6 w-0.5 h-4 bg-neutral-800"></div>
          )}
          <AddStepUI onAdd={(type) => addStep(parentId, branch, type)} depth={depth} />
        </div>
      </div>
    );
  };

  const renderStepBody = (step: FlowStep, depth: number) => {
    const update = (updater: Partial<FlowStep>) => {
      setFormSteps(prev => updateStepInTree(prev, step.id, s => ({ ...s, ...updater }) as FlowStep));
    };

    if (step.type === 'send_message') {
      return (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => insertVariable(step.id, '{nome}')} className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs rounded border border-emerald-500/20 font-mono">
                + {'{nome}'}
              </button>
              <button type="button" onClick={() => insertVariable(step.id, '{Oi|Olá|Bom dia}')} className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded border border-neutral-700 font-mono">
                + Spintax
              </button>
            </div>
            {templates.length > 0 && (
              <select
                className="text-xs px-2 py-1 bg-neutral-950 border border-neutral-800 rounded focus:outline-none focus:border-emerald-500 text-white"
                onChange={(e) => { if (e.target.value) applyTemplate(step.id, e.target.value); e.target.value = ''; }}
                value=""
              >
                <option value="" disabled>Usar template...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>
          <textarea
            id={`textarea-${step.id}`}
            required
            value={step.message}
            onChange={(e) => update({ message: e.target.value })}
            placeholder="Digite a mensagem..."
            className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500 min-h-[100px]"
          />
          <div>
            <label className="block text-[10px] uppercase text-neutral-500 font-medium mb-1">Fallback Nome</label>
            <input
              type="text"
              required
              value={step.fallbackName}
              onChange={(e) => update({ fallbackName: e.target.value })}
              className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          {step.message && (
            <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 relative group overflow-hidden mt-2">
              <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-neutral-800 text-[10px] text-neutral-400 rounded">
                Preview
              </div>
              <div className="text-sm text-neutral-300 whitespace-pre-wrap font-mono mt-1">
                {renderMessageTemplate(step.message, { jid: '', name: 'João' })}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (step.type === 'delay') {
      const getUnit = (sec: number) => {
        if (sec % 86400 === 0 && sec >= 86400) return { val: sec / 86400, unit: 'days' };
        if (sec % 3600 === 0 && sec >= 3600) return { val: sec / 3600, unit: 'hours' };
        if (sec % 60 === 0 && sec >= 60) return { val: sec / 60, unit: 'minutes' };
        return { val: sec, unit: 'seconds' };
      };
      
      const current = getUnit(step.durationSeconds);
      
      const handleChange = (val: string, unit: string) => {
        let n = parseInt(val) || 0;
        if (n < 0) n = 0;
        let sec = n;
        if (unit === 'minutes') sec = n * 60;
        if (unit === 'hours') sec = n * 3600;
        if (unit === 'days') sec = n * 86400;
        update({ durationSeconds: sec });
      };

      return (
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1">Aguardar (tempo)</label>
          <div className="flex gap-2">
            <input
              type="number"
              required
              min="1"
              value={current.val}
              onChange={(e) => handleChange(e.target.value, current.unit)}
              className="w-24 px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
            />
            <select
              value={current.unit}
              onChange={(e) => handleChange(current.val.toString(), e.target.value)}
              className="flex-1 px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="seconds">Segundos</option>
              <option value="minutes">Minutos</option>
              <option value="hours">Horas</option>
              <option value="days">Dias</option>
            </select>
          </div>
        </div>
      );
    }

    if (step.type === 'condition') {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-950 p-3 rounded-lg border border-neutral-800">
            <div>
              <label className="block text-[10px] uppercase text-neutral-500 font-medium mb-1">Tipo de Condição</label>
              <select
                value={step.condition.type}
                onChange={(e) => {
                  const type = e.target.value as any;
                  if (type === 'has_tag') update({ condition: { type, tagId: '' } });
                  if (type === 'in_list') update({ condition: { type, listId: '' } });
                }}
                className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-md text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="has_tag">Possui a Tag</option>
                <option value="in_list">Está na Lista</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase text-neutral-500 font-medium mb-1">Recurso</label>
              {step.condition.type === 'has_tag' ? (
                <select
                  required
                  value={(step.condition as any).tagId || ''}
                  onChange={(e) => update({ condition: { type: 'has_tag', tagId: e.target.value } })}
                  className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-md text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="" disabled>Selecione uma tag...</option>
                  {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              ) : (
                <select
                  required
                  value={(step.condition as any).listId || ''}
                  onChange={(e) => update({ condition: { type: 'in_list', listId: e.target.value } })}
                  className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-md text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="" disabled>Selecione uma lista...</option>
                  {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-emerald-500/20 rounded-xl p-4 bg-emerald-500/5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <h4 className="text-sm font-bold text-emerald-400">Se Verdadeiro</h4>
              </div>
              {renderStepList(step.ifTrue, step.id, 'true', depth + 1)}
            </div>
            <div className="border border-rose-500/20 rounded-xl p-4 bg-rose-500/5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                <h4 className="text-sm font-bold text-rose-400">Se Falso</h4>
              </div>
              {renderStepList(step.ifFalse, step.id, 'false', depth + 1)}
            </div>
          </div>
        </div>
      );
    }

    if (['add_tag', 'remove_tag'].includes(step.type)) {
      return (
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1">Selecione a Tag</label>
          <select
            required
            value={(step as any).tagId || ''}
            onChange={(e) => update({ tagId: e.target.value })}
            className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="" disabled>Selecione...</option>
            {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      );
    }

    if (['add_to_list', 'remove_from_list'].includes(step.type)) {
      return (
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1">Selecione a Lista</label>
          <select
            required
            value={(step as any).listId || ''}
            onChange={(e) => update({ listId: e.target.value })}
            className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="" disabled>Selecione...</option>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      );
    }

    return null;
  };

  const getResourceName = (f: Flow) => {
    if (f.trigger.type === 'contact_added_to_list') {
      const l = lists.find(list => list.id === (f.trigger as any).listId);
      return l ? l.name : null;
    } else {
      const t = tags.find(tag => tag.id === (f.trigger as any).tagId);
      return t ? t.name : null;
    }
  };

  const selectedListObj = lists.find(l => l.id === formTriggerResource);
  const flowToDeleteObj = flows.find(f => f.id === deleteConfirmation);

  if (!selectedInstanceId) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center px-4 animate-in fade-in duration-500">
        <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4 shadow-xl">
          <Layers className="w-8 h-8 text-neutral-500" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Instância Não Selecionada</h2>
        <p className="text-neutral-400 max-w-md">
          Selecione ou conecte uma instância do WhatsApp no painel lateral para gerenciar Fluxos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      {/* Header */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Fluxos
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                Crie jornadas e sequências de mensagens automatizadas.
              </p>
            </div>
          </div>
          <Button onClick={openNew} variant="primary" className="shrink-0">
            <Plus className="w-5 h-5 mr-2" />
            Novo Fluxo
          </Button>
        </div>
      </div>

      {(actionError || error) && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
            <X className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-sm text-rose-400 font-medium">
            {actionError || error}
          </p>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Total de Fluxos</p>
            <p className="text-2xl font-bold text-white mt-0.5">{metrics.total}</p>
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Play className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Ativos</p>
            <p className="text-2xl font-bold text-emerald-400 mt-0.5">{metrics.active}</p>
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
            <Pause className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Pausados</p>
            <p className="text-2xl font-bold text-amber-400 mt-0.5">{metrics.paused}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            placeholder="Buscar fluxos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-48 text-neutral-400">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3"></div>
          Carregando fluxos...
        </div>
      ) : filteredFlows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4 bg-neutral-900/50 border border-neutral-800 border-dashed rounded-2xl">
          <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4">
            <Layers className="w-8 h-8 text-neutral-500" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Nenhum fluxo criado</h3>
          <p className="text-neutral-400 max-w-sm mb-6">
            Crie um fluxo para automatizar sequências complexas de atendimento.
          </p>
          {!search && (
            <Button onClick={openNew} variant="primary">
              <Plus className="w-4 h-4 mr-2" />
              Criar primeiro fluxo
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredFlows.map(f => {
            const resourceName = getResourceName(f);
            return (
              <div key={f.id} className="bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700/90 rounded-2xl p-5 shadow-sm flex flex-col gap-4 transition-all">
                <div className="flex items-start justify-between min-w-0">
                  <div className="space-y-1 min-w-0 flex-1">
                    <h3 className="font-bold text-white truncate pr-2" title={f.name}>{f.name}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      {f.enabled ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border bg-amber-500/10 text-amber-400 border-amber-500/20">
                          Pausado
                        </span>
                      )}
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border bg-neutral-800 text-neutral-400 border-neutral-700">
                        {countSteps(f.steps)} Passos
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label={f.enabled ? "Pausar" : "Ativar"}
                      title={f.enabled ? "Pausar" : "Ativar"}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                      onClick={() => toggleEnabled(f)}
                    >
                      {f.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      aria-label="Editar"
                      title="Editar fluxo"
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                      onClick={() => openEdit(f)}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Excluir"
                      title="Excluir fluxo"
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition-colors"
                      onClick={() => openDelete(f.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="bg-neutral-950/40 rounded-xl p-3 border border-neutral-800/50">
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
                    {f.trigger.type === 'contact_added_to_list' ? (
                      <><Users className="w-3.5 h-3.5" /> GATILHO: Contato adicionado à lista</>
                    ) : (
                      <><Tag className="w-3.5 h-3.5" /> GATILHO: Tag adicionada ao contato</>
                    )}
                  </div>
                  {resourceName ? (
                    <div className="text-sm font-medium text-neutral-300 truncate">
                      {f.trigger.type === 'contact_added_to_list' ? 'LISTA: ' : 'TAG: '}
                      {resourceName}
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 mt-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs rounded-lg">
                      <AlertTriangle className="w-3.5 h-3.5" /> Gatilho indisponível
                    </div>
                  )}
                </div>

                {f.updatedAt && (
                  <div className="pt-3 mt-auto border-t border-neutral-800 flex justify-between items-center text-xs text-neutral-500">
                    Atualizado em {new Date(f.updatedAt).toLocaleDateString('pt-BR')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Novo/Editar Fluxo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 p-4 sm:p-6 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-4xl max-h-[calc(100dvh-2rem)] flex flex-col bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {editingId ? 'Editar Fluxo' : 'Novo Fluxo'}
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">Construa sua jornada automatizada de atendimento.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-2 bg-neutral-800/80 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors"
                title="Fechar modal"
                aria-label="Fechar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hidden overscroll-contain p-6">
              {formError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm flex items-center gap-2 mb-6">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}

              <form id="flow-form" onSubmit={handleSave} className="space-y-8">
                
                {/* 1. Nome e Status */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                        1. Nome do Fluxo *
                      </label>
                      <input
                        type="text"
                        required
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="Ex: Funil de Vendas"
                        className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="sm:w-48">
                      <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2 text-transparent sm:text-neutral-300 sm:select-text select-none">
                        Status Inicial
                      </label>
                      <select
                        value={formEnabled ? 'true' : 'false'}
                        onChange={(e) => setFormEnabled(e.target.value === 'true')}
                        className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="true">Ativo</option>
                        <option value="false">Pausado</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. Gatilho */}
                <div className="bg-neutral-950 p-4 sm:p-5 rounded-2xl border border-neutral-800 space-y-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    2. Gatilho <span className="text-neutral-500 font-normal">(Quando isso acontecer)</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1">
                        Evento *
                      </label>
                      <select
                        value={formTriggerType}
                        onChange={(e) => {
                          setFormTriggerType(e.target.value as any);
                          setFormTriggerResource('');
                        }}
                        className="w-full px-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="contact_added_to_list">Contato adicionado a uma Lista</option>
                        <option value="tag_added_to_contact">Tag adicionada a um Contato</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1">
                        {formTriggerType === 'contact_added_to_list' ? 'Lista *' : 'Tag *'}
                      </label>
                      <select
                        required
                        value={formTriggerResource}
                        onChange={(e) => setFormTriggerResource(e.target.value)}
                        className="w-full px-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="" disabled>Selecione...</option>
                        {formTriggerType === 'contact_added_to_list' && lists.map(l => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                        {formTriggerType === 'tag_added_to_contact' && tags.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  {formTriggerType === 'contact_added_to_list' && formTriggerResource && selectedListObj && (
                    <div className="mt-2 text-xs text-neutral-400 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      O fluxo iniciará quando alguém entrar em <span className="text-neutral-200 font-medium">{selectedListObj.name}</span>
                    </div>
                  )}
                </div>

                {/* 3. Construtor */}
                <div>
                  <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider mb-4">
                    3. Passos do Fluxo
                  </h3>
                  <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800">
                    <div className="max-w-2xl mx-auto">
                      {renderStepList(formSteps, null, null)}
                    </div>
                  </div>
                </div>
              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-neutral-800 bg-neutral-900 flex items-center justify-end gap-3 shrink-0">
              <Button type="button" variant="secondary" onClick={closeModal}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                form="flow-form" 
                variant="primary"
                disabled={!formName.trim() || !formTriggerResource || formSteps.length === 0}
              >
                {editingId ? 'Salvar Alterações' : 'Criar Fluxo'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de Template */}
      {templateConfirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setTemplateConfirmation(null)} />
          <div className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Substituir mensagem atual pelo template?</h3>
            <p className="text-sm text-neutral-400 mb-6">
              A mensagem atual será substituída pelo conteúdo do template. Deseja continuar?
            </p>
            <div className="flex gap-3 justify-center">
              <Button type="button" variant="secondary" onClick={() => setTemplateConfirmation(null)}>
                Cancelar
              </Button>
              <Button type="button" variant="primary" onClick={confirmApplyTemplate}>
                Substituir
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de Exclusão */}
      {deleteConfirmation && flowToDeleteObj && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setDeleteConfirmation(null); setDeleteError(null); }} />
          <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4 mb-2">
              <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-full flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="pt-1">
                <h3 className="text-xl font-bold text-white mb-2">Excluir Fluxo</h3>
                <p className="text-neutral-400 text-sm mb-6">
                  Tem certeza que deseja excluir o fluxo "{flowToDeleteObj.name}"? Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
            
            {deleteError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm text-left flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-4">
              <Button type="button" variant="secondary" onClick={() => { setDeleteConfirmation(null); setDeleteError(null); }}>
                Cancelar
              </Button>
              <Button type="button" variant="danger" onClick={handleDelete}>
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

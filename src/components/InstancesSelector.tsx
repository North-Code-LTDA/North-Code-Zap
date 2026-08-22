import React, { useState } from 'react';
import { useInstances } from '../contexts/InstancesContext';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';

export function InstancesSelector() {
  const { instances, selectedInstanceId, selectInstance, createInstance, renameInstance, deleteInstance } = useInstances();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = async () => {
    if (newName.trim()) {
      await createInstance(newName);
      setNewName('');
      setIsCreating(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select 
        className="bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-md px-3 py-1.5 text-sm"
        value={selectedInstanceId || ''} 
        onChange={(e) => selectInstance(e.target.value)}
      >
        <option value="" disabled>Selecione uma Instância</option>
        {instances.map(i => (
          <option key={i.id} value={i.id}>
            {i.name} {i.account?.status === 'connected' ? '(Online)' : i.account?.status === 'disconnected' ? '(Offline)' : ''}
          </option>
        ))}
      </select>
      
      {isCreating ? (
        <div className="flex items-center gap-1">
          <input 
            type="text" 
            className="border rounded-md px-2 py-1 text-sm dark:bg-neutral-800 dark:border-neutral-700" 
            value={newName} 
            onChange={e => setNewName(e.target.value)}
            placeholder="Nome..."
            autoFocus
          />
          <button onClick={handleCreate} className="p-1 text-emerald-500"><Check className="w-4 h-4" /></button>
          <button onClick={() => setIsCreating(false)} className="p-1 text-red-500"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <button 
          onClick={() => setIsCreating(true)} 
          className="p-1.5 text-neutral-500 hover:text-emerald-500 rounded-md transition-colors border border-transparent hover:border-emerald-200 dark:hover:border-emerald-800"
          title="Nova Instância"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
      
      {selectedInstanceId && (
        <button 
          onClick={() => {
            const currentName = instances.find(i => i.id === selectedInstanceId)?.name || '';
            const newName = prompt('Novo nome da instância:', currentName);
            if (newName && newName.trim() && newName !== currentName) {
              renameInstance(selectedInstanceId, newName);
            }
          }} 
          className="p-1.5 text-neutral-500 hover:text-blue-500 rounded-md transition-colors border border-transparent hover:border-blue-200 dark:hover:border-blue-800"
          title="Renomear Instância"
        >
          <Edit2 className="w-4 h-4" />
        </button>
      )}

      {selectedInstanceId && (
        <button 
          onClick={() => {
            if (confirm('Tem certeza que deseja apagar esta instância? Todos os dados serão perdidos.')) {
              deleteInstance(selectedInstanceId);
            }
          }} 
          className="p-1.5 text-neutral-500 hover:text-red-500 rounded-md transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-800"
          title="Apagar Instância"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

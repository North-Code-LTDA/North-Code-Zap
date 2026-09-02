const fs = require('fs');

let code = fs.readFileSync('src/hooks/useContacts.ts', 'utf8');

code = code.replace(
  `  const fetchContacts = useCallback(async () => {
    if (!instanceId) return;

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(\`/api/instances/\${instanceId}/contacts\`);
      if (!res.ok) {
        throw new Error('Falha ao carregar contatos');
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error('Formato de resposta inválido');
      }
      setContacts(data);
    } catch (err: any) {
      setError(err.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [instanceId]);`,
  `  const fetchContacts = useCallback(async () => {
    const instanceIdForFetch = instanceId;
    if (!instanceIdForFetch) {
      return;
    }
    
    if (activeInstanceRef.current !== instanceIdForFetch) {
      return;
    }
    
    const requestSeq = ++requestSeqRef.current;
    
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(\`/api/instances/\${instanceIdForFetch}/contacts\`);
      if (!res.ok) {
        throw new Error('Falha ao carregar contatos');
      }
      const data = await res.json();
      
      if (activeInstanceRef.current !== instanceIdForFetch || requestSeqRef.current !== requestSeq) {
        return;
      }
      
      if (!Array.isArray(data)) {
        throw new Error('Formato de resposta inválido');
      }
      setContacts(data);
    } catch (err: any) {
      if (activeInstanceRef.current !== instanceIdForFetch || requestSeqRef.current !== requestSeq) {
        return;
      }
      setError(err.message || 'Erro desconhecido');
    } finally {
      if (activeInstanceRef.current === instanceIdForFetch && requestSeqRef.current === requestSeq) {
        setLoading(false);
      }
    }
  }, [instanceId]);`
);

fs.writeFileSync('src/hooks/useContacts.ts', code);
console.log('useContacts patched!');

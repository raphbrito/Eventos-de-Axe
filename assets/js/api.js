const Api = {
  async request(route, method = 'POST', data = {}, authenticated = false) {
    if (!window.EVENTOS_DE_AXE_API_URL || window.EVENTOS_DE_AXE_API_URL.includes('COLE_AQUI')) throw new Error('Configure a URL da API em assets/js/config.js.');
    window.setRequestPending?.(true);
    try {
      const url = new URL(window.EVENTOS_DE_AXE_API_URL);
      url.searchParams.set('route', route);
      const payload = { ...data, route };
      if (authenticated) payload.token = Session.get();
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(method === 'POST' ? payload : { ...payload, _method: method })
      });
      const result = await response.json().catch(() => { throw new Error('Resposta inválida da API.'); });
      if (!result.success) {
        if (result.error && ['UNAUTHORIZED', 'SESSION_EXPIRED'].includes(result.error.code)) Session.clear();
        throw new Error(result.message);
      }
      return result;
    } finally {
      window.setRequestPending?.(false);
    }
  }
};

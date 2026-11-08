'use strict';
(() => {
  let installPrompt = null;
  const button = document.getElementById('installButton');
  const dialog = document.getElementById('installHelp');
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const sync = () => { button.classList.toggle('hidden', standalone()); };
  sync();
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event; sync();
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; button.classList.add('hidden'); if (dialog.open) dialog.close(); });
  button.addEventListener('click', async () => {
    if (!installPrompt) { if (!dialog.open) dialog.showModal(); return; }
    const prompt = installPrompt; installPrompt = null; button.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') button.classList.add('hidden');
    } catch { if (!dialog.open) dialog.showModal(); }
    finally { button.disabled = false; }
  });
  document.getElementById('closeInstallHelp').addEventListener('click', () => dialog.close());
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.filter(r=>new URL(r.scope).pathname==='/').map(r=>r.unregister()))).then(()=>navigator.serviceWorker.register('/club/sw.js', { scope: '/club/', updateViaCache: 'none' })).catch(() => { /* Chrome's menu still provides the installation entry point. */ });
  }
})();

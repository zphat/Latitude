// UI only. Release URLs, checksums, files and installation stay in the main process.
export function installUpdates({ api, isBusy, activity, prepare, toast }) {
  const $ = (s) => document.querySelector(s);
  const dialog = $('#update-dialog'), check = $('#updates-check'), enabled = $('#updates-enabled');
  if (!api?.updates) { check.disabled = enabled.disabled = true; $('#updates-notes').disabled = true; return; }
  let state, timer, startTimer, launchReady = false, disposed = false, launchPending = true, working = false, canceled = false, lastActive = false;
  const otherDialog = () => !!document.querySelector('dialog[open]:not(#update-dialog)');
  const occupied = () => isBusy() || document.hidden || otherDialog();
  const later = () => { clearTimeout(timer); if (!disposed) timer = setTimeout(refresh, 1000); };
  function refresh() {
    clearTimeout(timer);
    if (disposed || !state) return;
    if (launchPending && launchReady) {
      if (!state.enabled || state.mode === 'development') launchPending = false;
      else if (!occupied() && !working) {
        launchPending = false;
        api.updates('launch').then(render).catch(() => { launchPending = true; later(); });
      } else later();
    }
    if (state.prompt && !dialog.open) {
      if (occupied()) later();
      else dialog.showModal();
    }
    if (!state.prompt && dialog.open) dialog.close();
  }
  function render(next) {
    if (disposed) return;
    state = next;
    const downloading = state.phase === 'downloading', installing = state.phase === 'installing';
    const active = working || downloading || installing;
    if (active !== lastActive) { lastActive = active; activity(active); }
    enabled.checked = state.enabled;
    enabled.disabled = working || downloading || installing || state.mode === 'development';
    check.disabled = working || downloading || installing || state.phase === 'checking' || state.mode === 'development';
    check.textContent = state.phase === 'checking' ? 'Checking…' : 'Check for updates';
    $('#updates-status').textContent = state.message;
    $('#update-title').textContent = state.phase === 'opened' ? 'Your update is ready to finish.' : `Latitude ${state.version || ''} is available.`;
    $('#update-description').textContent = state.mode === 'windows'
      ? 'Your settings, recordings and editor recovery draft are kept. Latitude will close and the installer will open.'
      : state.mode === 'flatpak'
        ? 'Download the verified Flatpak, then finish updating in your software center. Your recordings and settings are kept.'
        : 'Download the verified portable ZIP. Extract it, close Latitude and replace your old portable app folder. Your recordings and settings are kept.';
    $('#update-status').textContent = state.phase === 'available' ? `Installed: ${state.current} · Download: ${(state.size / 1048576).toFixed(0)} MB` : downloading ? `${state.message} ${state.percent}% · ${(state.size / 1048576).toFixed(0)} MB total` : state.message;
    $('#update-progress').hidden = !downloading;
    $('#update-progress').value = state.percent;
    $('#update-skip').disabled = installing;
    $('#update-skip').textContent = downloading ? 'Cancel download' : state.phase === 'opened' ? 'Done' : 'Skip until next launch';
    $('#update-now').disabled = working || downloading || installing;
    $('#update-now').hidden = state.phase === 'opened';
    $('#update-now').textContent = state.phase === 'ready' ? 'Install update' : state.phase === 'error' ? 'Try again' : 'Update now';
    refresh();
  }
  function report(error) { toast(error.message || 'The update could not be completed. Try again later.', true); }
  async function skip() {
    if (state?.phase === 'installing') return;
    canceled = true;
    // Close immediately; the native side aborts and removes unfinished downloads.
    dialog.close();
    try { render(await api.updates('skip')); } catch (error) { report(error); }
  }
  $('#update-skip').onclick = skip;
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); skip(); });
  $('#update-now').onclick = async () => {
    if (working || isBusy()) return;
    working = true; canceled = false; render(state);
    try {
      const downloaded = await api.updates('download');
      render(downloaded);
      if (downloaded.phase !== 'ready' || canceled) return;
      await prepare();
      const pending = [];
      window.dispatchEvent(new CustomEvent('latitude-before-update', { detail: { waitUntil: (promise) => pending.push(Promise.resolve(promise)) } }));
      await Promise.all(pending);
      if (!canceled) render(await api.updates('install'));
    } catch (error) { report(error); }
    finally { working = false; render(state); }
  };
  check.onclick = async () => {
    try { launchPending = false; render(await api.updates('check')); }
    catch (error) { report(error); }
  };
  enabled.onchange = async () => {
    const value = enabled.checked; enabled.disabled = true;
    try { render(await api.updates('enabled', value)); }
    catch (error) { report(error); render(state); }
  };
  for (const id of ['#updates-notes', '#update-notes']) $(id).onclick = () => api.updates('notes').catch(report);
  const off = api.onUpdateState(render);
  // One startup timer; while a prompt is deferred only a cheap idle check runs.
  // There are no recurring network checks or idle timers after a skip/current result.
  api.updates('state').then((initial) => {
    render(initial);
    startTimer = setTimeout(() => { launchReady = true; refresh(); }, 2000);
  }).catch(report);
  window.addEventListener('beforeunload', () => { disposed = true; clearTimeout(timer); clearTimeout(startTimer); off(); }, { once: true });
}

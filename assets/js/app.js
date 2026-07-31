function showMessage(element, message, isError = false) { element.textContent = message; element.className = `message ${isError ? 'error' : 'success'}`; }
function queryToken() { return new URLSearchParams(location.search).get('token'); }
function redirectIfLoggedIn() { if (Session.get()) location.replace('perfil.html'); }

let pendingRequestCount = 0;
function setRequestPending(isPending) {
  pendingRequestCount += isPending ? 1 : -1;
  pendingRequestCount = Math.max(0, pendingRequestCount);
  const pending = pendingRequestCount > 0;
  document.body.setAttribute('aria-busy', String(pending));
  document.querySelectorAll('button').forEach(button => {
    if (pending) {
      if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent;
      button.disabled = true;
      button.textContent = 'Aguarde...';
    } else if (button.dataset.defaultLabel) {
      button.disabled = false;
      button.textContent = button.dataset.defaultLabel;
      delete button.dataset.defaultLabel;
    }
  });
}

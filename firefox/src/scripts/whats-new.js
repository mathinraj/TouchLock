const EMAILJS_SERVICE_ID  = 'service_em2o2a6';
const EMAILJS_TEMPLATE_ID = 'template_6595ut4';
const EMAILJS_PUBLIC_KEY  = 'R2Yro3gG1FbXS9fJm';

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.set({ showWhatsNew: false });

  const btnRequest = document.getElementById('btn-request-feature');
  const modal      = document.getElementById('fr-modal');
  const modalClose = document.getElementById('modal-close');
  const modalSend  = document.getElementById('modal-send');
  const modalMsg   = document.getElementById('modal-msg');
  const modalEmail = document.getElementById('modal-email');
  const modalCat   = document.getElementById('modal-category');
  const modalText  = document.getElementById('modal-message');

  btnRequest.addEventListener('click', () => modal.classList.remove('hidden'));
  modalClose.addEventListener('click', () => modal.classList.add('hidden'));

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  modalSend.addEventListener('click', async () => {
    const message = modalText.value.trim();
    const email   = modalEmail.value.trim();

    if (!email) {
      showModalMsg('Please enter your email.', 'error');
      return;
    }
    if (message.length < 10) {
      showModalMsg('Please enter at least 10 characters.', 'error');
      return;
    }

    modalSend.disabled = true;
    modalSend.textContent = 'Sending…';

    try {
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id:  EMAILJS_SERVICE_ID,
          template_id: EMAILJS_TEMPLATE_ID,
          user_id:     EMAILJS_PUBLIC_KEY,
          template_params: {
            from_email: email,
            category:   modalCat.value,
            message:    message,
            timestamp:  new Date().toISOString(),
            version:    chrome.runtime.getManifest().version
          }
        })
      });

      if (res.ok) {
        showModalMsg('Thank you! Your request has been sent.', 'success');
        modalEmail.value = '';
        modalText.value = '';
        modalCat.value = 'feature';
        setTimeout(() => modal.classList.add('hidden'), 2000);
      } else {
        throw new Error(`Status ${res.status}`);
      }
    } catch (_) {
      showModalMsg('Failed to send. Please try again later.', 'error');
    }

    modalSend.disabled = false;
    modalSend.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
      Send`;
  });

  function showModalMsg(text, type) {
    modalMsg.textContent = text;
    modalMsg.className = `modal-msg ${type}`;
  }
});

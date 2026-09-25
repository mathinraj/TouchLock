document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.set({ showWhatsNew: false });

  document.getElementById('btn-got-it').addEventListener('click', () => {
    window.close();
  });
});

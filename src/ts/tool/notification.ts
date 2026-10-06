export function showToast(message: string, color: string = '#39FF14'): void {
  const oldToast = document.querySelector('.toast-notification');
  if (oldToast) oldToast.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;

  toast.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
  toast.style.border = `2px solid ${color}`;
  toast.style.color = color;
  toast.style.boxShadow = `0 0 20px rgba(0,0,0,0.3), 0 0 8px ${color}40`;

  document.body.prepend(toast);


  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-20px)';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}
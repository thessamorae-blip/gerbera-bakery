// Hook que maneja las notificaciones temporales ("toast") en el panel admin.
// Muestra un mensaje brevemente y lo borra solo después de unos segundos.
// Uso: const [toast, showToast] = useToast();
//      showToast('Producto guardado') → aparece el mensaje y desaparece automáticamente.

export function useToast(duration = 2000) {
  const [toast, setToast] = React.useState('');
  const timerRef = React.useRef(null);

  // Muestra el mensaje recibido y lo oculta automáticamente al terminar el tiempo.
  const showToast = (msg) => {
    setToast(msg);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(''), duration);
  };

  return [toast, showToast];
}

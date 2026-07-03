import { getStatusIndex } from '../utils/orderHelpers.js';

// Hook que maneja el rastreo de pedidos por folio.
// Guarda el folio que el cliente escribe, el pedido encontrado y el mensaje de resultado.
// Se usa en el portal del cliente y en la landing page (los dos lugares donde el cliente puede rastrear su pedido).
// Uso:
//   const { folioInput, setFolioInput, trackedOrder, trackMessage, handleSearch, handleCancel } = useFolioTracker();

export function useFolioTracker() {
  const [folioInput,    setFolioInput]  = React.useState('');
  const [trackedOrder,  setTrackedOrder]= React.useState(null);
  const [trackMessage,  setTrackMessage]= React.useState('');

  // Busca el pedido en el servidor usando el folio que el cliente escribió.
  // Si lo encuentra, guarda el pedido para mostrarlo. Si no, muestra un mensaje de error.
  const handleSearch = async () => {
    if (!folioInput.trim()) return;
    const res = await fetch(`/api/orders/folio?q=${encodeURIComponent(folioInput.trim())}`);
    if (res.ok) {
      setTrackedOrder(await res.json());
      setTrackMessage('');
    } else {
      setTrackedOrder(null);
      setTrackMessage('No se encontró un pedido con ese folio.');
    }
  };

  // Cancela el pedido rastreado. Pide confirmación antes de proceder.
  // Si el pedido ya está en producción, avisa que solo se reembolsa el 50% del anticipo.
  const handleCancel = async () => {
    if (!trackedOrder) return;
    const needsWarning = getStatusIndex(trackedOrder.status) >= getStatusIndex('En producción');
    const msg = needsWarning
      ? 'Este pedido ya está en producción. Si lo cancelas, se reembolsa solo el 50% del anticipo. ¿Deseas continuar?'
      : 'Se reembolsará el 100% del anticipo. ¿Deseas continuar?';
    if (!window.confirm(msg)) return;
    const res = await fetch(`/api/orders/${trackedOrder.id}/cancel`, { method: 'POST' });
    if (res.ok) setTrackedOrder(await res.json());
  };

  return { folioInput, setFolioInput, trackedOrder, trackMessage, handleSearch, handleCancel };
}

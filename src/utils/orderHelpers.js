import { STATUS_FLOW } from '../ordersStore.js';

// Devuelve la posición de un estado dentro del flujo de pedidos.
// 0 = Recibido, 1 = Confirmado, ... 5 = Cancelado.
// Se usa para saber si un estado ya ocurrió o está pendiente en la línea de tiempo.
export function getStatusIndex(status) {
  return STATUS_FLOW.indexOf(status);
}

// Devuelve la hora estimada de cada etapa del pedido.
// Solo es referencia visual — no afecta la lógica de negocio.
export function getEstimatedTime(order) {
  const timeMap = {
    Recibido:            '10:00',
    Confirmado:          '12:00',
    'En producción':     '14:00',
    'Listo para entrega':'16:00',
    Entregado:           '16:30',
    Cancelado:           '—',
  };
  return timeMap[order.status] || '10:00';
}

// Cuenta cuántos pedidos hay en cada estado. Recibe la lista completa de pedidos.
// Devuelve un objeto como: { "Recibido": 3, "Confirmado": 1, "En producción": 2, ... }
// Se usa en el dashboard de admin para mostrar las barras de progreso por estado.
export function buildStatusCounts(orders) {
  return STATUS_FLOW.reduce((acc, status) => {
    acc[status] = orders.filter(o => o.status === status).length;
    return acc;
  }, {});
}

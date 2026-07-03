// Calcula el precio total del pastel completo a partir del precio por porción.
// El brownie se vende en charolas de 16 piezas; todos los demás pasteles en tamaños de 12 porciones.
// Recibe el ID del producto y el precio por porción. Devuelve el precio completo como número.
// Ejemplo: computeFullPrice('zanahoria', 36) → 432
export function computeFullPrice(id, price) {
  const p = Number(price) || 0;
  const multiplier = (id === 'brownie-caramelo') ? 16 : 12;
  return p * multiplier;
}

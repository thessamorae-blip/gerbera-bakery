// Convierte un número a formato de pesos mexicanos.
// Recibe un valor numérico y devuelve un texto como "$1,234.00".
// Ejemplo: formatCurrency(432) → "$432.00"
export function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value) || 0);
}

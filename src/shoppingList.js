import { MATERIALS } from './materialsData.js';
import { RECIPES } from './recipesData.js';

function addToMap(map, key, qty, unit) {
  const prev = map.get(key) || { qty: 0, unit };
  map.set(key, { qty: prev.qty + qty, unit });
}

export function buildAggregatedList(selectedRecipeIds = RECIPES.map(r => r.id), multiplier = 1) {
  const aggregated = new Map();
  selectedRecipeIds.forEach((rid) => {
    const recipe = RECIPES.find(r => r.id === rid);
    if (!recipe) return;
    recipe.sections.forEach((section) => {
      section.items.forEach(([name, qty, unit]) => {
        const qtyNum = Number(qty) * multiplier;
        addToMap(aggregated, name, qtyNum, unit);
      });
    });
  });

  // Convert to grouped by category
  const byCategory = {};
  let grandTotal = 0;
  aggregated.forEach((val, name) => {
    const mat = MATERIALS[name] || null;
    const category = mat ? mat.category : 'Sin categorizar';
    const unitCost = mat ? mat.unitCost : 0;
    const subtotal = (unitCost || 0) * val.qty;
    grandTotal += subtotal;
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push({ name, qty: val.qty, unit: val.unit, unitCost, subtotal });
  });

  return { byCategory, grandTotal };
}

export function exportShoppingPDF(aggregated, filename = 'lista_compra.pdf') {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 14;
  doc.setFontSize(16);
  doc.text('Gerbera Bakery - Lista de compras', 14, y);
  y += 8;
  doc.setFontSize(11);

  Object.keys(aggregated.byCategory).forEach((cat) => {
    doc.setFontSize(12);
    doc.text(cat, 14, y);
    y += 6;
    doc.setFontSize(10);
    aggregated.byCategory[cat].forEach((item) => {
      const line = `${item.name} — ${item.qty} ${item.unit} — $${item.subtotal.toFixed(2)}`;
      const split = doc.splitTextToSize(line, 180);
      doc.text(split, 16, y);
      y += split.length * 6;
      if (y > 270) { doc.addPage(); y = 20; }
    });
    y += 6;
  });
  doc.setFontSize(12);
  doc.text(`Total estimado: $${aggregated.grandTotal.toFixed(2)}`, 14, y + 4);
  doc.save(filename);
}

export function buildFromOrders(orders = []) {
  const aggregated = new Map();
  function add(name, qty, unit) {
    const prev = aggregated.get(name) || { qty: 0, unit };
    aggregated.set(name, { qty: prev.qty + qty, unit: unit || prev.unit || 'pieza' });
  }

  /* Loop principal: recorre todos los pedidos activos (excluye cancelados y entregados).
     Por cada pedido, busca la receta del producto y suma sus ingredientes al total acumulado.
     Al terminar, el Map "aggregated" contiene todos los ingredientes necesarios con su cantidad total. */
  orders.forEach((order) => {
    if (!order || order.status === 'Cancelado' || order.status === 'Entregado') return;
    const multiplier = Number(order.quantity) || 1;
    const recipeId = order.item?.recipeId || order.item?.id;
    if (recipeId) {
      const recipe = RECIPES.find((r) => r.id === recipeId);
      if (recipe) {
        /* Loop anidado: recorre cada sección de la receta (masa, betún, relleno...) y suma cada ingrediente */
        recipe.sections.forEach((section) => section.items.forEach(([name, qty, unit]) => add(name, Number(qty) * multiplier, unit)));
        return;
      }
    }
    if (order.requestedItems && Array.isArray(order.requestedItems) && order.requestedItems.length) {
      order.requestedItems.forEach((it) => add(it.name, Number(it.quantity || 1) * multiplier, it.unit || 'pieza'));
      return;
    }
    // fallback: add product as piece
    const prodName = order.item?.name || 'Producto';
    add(prodName, multiplier, 'pieza');
  });

  // Convert to grouped by category
  const byCategory = {};
  let grandTotal = 0;
  aggregated.forEach((val, name) => {
    const mat = MATERIALS[name] || null;
    const category = mat ? mat.category : 'Sin categorizar';
    const unitCost = mat ? mat.unitCost : 0;
    const subtotal = (unitCost || 0) * val.qty;
    grandTotal += subtotal;
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push({ name, qty: val.qty, unit: val.unit, unitCost, subtotal });
  });

  return { byCategory, grandTotal };
}

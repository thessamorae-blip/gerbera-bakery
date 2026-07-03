import { STATUS_FLOW } from './ordersStore.js';
// Definidos aquí directamente para evitar problemas de caché de módulos ES
const OUT_OF_ZONE_STATUS      = 'CP fuera de cobertura';
const RESPONDED_STATUS        = 'Respondido';
const PENDING_PAYMENT_STATUS  = 'Pendiente de pago';
import { exportShoppingPDF, buildFromOrders } from './shoppingList.js';
import { CatalogEditor } from './catalogEditor.js';
import { ContentEditor } from './contentEditor.js';
import { SocialContent } from './socialContent.js';
import { RECIPES } from './recipesData.js';
import { formatCurrency } from './utils/formatCurrency.js';
import { getStatusIndex, getEstimatedTime, buildStatusCounts } from './utils/orderHelpers.js';
import { adminFetch } from './utils/authHelpers.js';
import { useFolioTracker } from './hooks/useFolioTracker.js';

const { useEffect, useState, useRef } = React;

function getCurrentPath() {
  return window.location.pathname || '/';
}

const DELIVERY_ZONES = [
  { label: 'Zona Esmeralda',                cost: 0,  days: 'all'      },
  { label: 'Arboledas',                     cost: 0,  days: 'weekends' },
  { label: 'Satélite',                      cost: 0,  days: 'weekends' },
  { label: 'Lomas Verdes',                  cost: 0,  days: 'weekends' },
  { label: 'San Mateo / Paseos del Bosque', cost: 0,  days: 'weekends' },
  { label: 'Reforma',                       cost: 35, days: 'weekends' },
  { label: 'Polanco',                       cost: 35, days: 'weekends' },
  { label: 'Chapultepec',                   cost: 35, days: 'weekends' },
];

const ZIP_ZONE_MAP = {
  // ── Zona Esmeralda (Atizapán de Zaragoza, Edo. Méx.) — cualquier día, sin costo ──
  '52920': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52925': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52926': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52927': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52928': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52929': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52930': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52931': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52932': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52933': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52934': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52935': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52936': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52937': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52938': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52939': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52940': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52945': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52950': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52955': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52960': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52965': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52970': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52975': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52976': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52977': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52978': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  '52979': { zone: 'Zona Esmeralda', cost: 0, days: 'all' },
  // ── Satélite (Naucalpan de Juárez, Edo. Méx.) — fin de semana, sin costo ──
  '53100': { zone: 'Satélite',       cost: 0, days: 'weekends' },
  '53110': { zone: 'Satélite',       cost: 0, days: 'weekends' },
  '53120': { zone: 'Satélite',       cost: 0, days: 'weekends' },
  '53125': { zone: 'Satélite',       cost: 0, days: 'weekends' },
  '53126': { zone: 'Satélite',       cost: 0, days: 'weekends' },
  '53127': { zone: 'Satélite',       cost: 0, days: 'weekends' },
  '53140': { zone: 'Satélite',       cost: 0, days: 'weekends' },
  '53150': { zone: 'Satélite',       cost: 0, days: 'weekends' },
  '53160': { zone: 'Satélite',       cost: 0, days: 'weekends' },
  '53180': { zone: 'Satélite',       cost: 0, days: 'weekends' },
  // ── Lomas Verdes (Naucalpan de Juárez, Edo. Méx.) — fin de semana, sin costo ──
  '52985': { zone: 'Lomas Verdes',   cost: 0, days: 'weekends' },
  '52990': { zone: 'Lomas Verdes',   cost: 0, days: 'weekends' },
  '52992': { zone: 'Lomas Verdes',   cost: 0, days: 'weekends' },
  '52994': { zone: 'Lomas Verdes',   cost: 0, days: 'weekends' },
  '52995': { zone: 'Lomas Verdes',   cost: 0, days: 'weekends' },
  // ── San Mateo / Paseos del Bosque (Naucalpan de Juárez, Edo. Méx.) — fin de semana, sin costo ──
  '53200': { zone: 'San Mateo / Paseos del Bosque', cost: 0, days: 'weekends' },
  '53210': { zone: 'San Mateo / Paseos del Bosque', cost: 0, days: 'weekends' },
  '53220': { zone: 'San Mateo / Paseos del Bosque', cost: 0, days: 'weekends' },
  '53230': { zone: 'San Mateo / Paseos del Bosque', cost: 0, days: 'weekends' },
  '53250': { zone: 'San Mateo / Paseos del Bosque', cost: 0, days: 'weekends' },
  '53260': { zone: 'San Mateo / Paseos del Bosque', cost: 0, days: 'weekends' },
  '53270': { zone: 'San Mateo / Paseos del Bosque', cost: 0, days: 'weekends' },
  // ── Polanco (Miguel Hidalgo, CDMX) — fin de semana, $30 envío ──
  '11510': { zone: 'Polanco',        cost: 30, days: 'weekends' },
  '11520': { zone: 'Polanco',        cost: 30, days: 'weekends' },
  '11530': { zone: 'Polanco',        cost: 30, days: 'weekends' },
  '11540': { zone: 'Polanco',        cost: 30, days: 'weekends' },
  '11550': { zone: 'Polanco',        cost: 30, days: 'weekends' },
  '11560': { zone: 'Polanco',        cost: 30, days: 'weekends' },
  '11570': { zone: 'Polanco',        cost: 30, days: 'weekends' },
  '11580': { zone: 'Polanco',        cost: 30, days: 'weekends' },
  '11590': { zone: 'Polanco',        cost: 30, days: 'weekends' },
  // ── Chapultepec / Lomas de Chapultepec (Miguel Hidalgo, CDMX) — fin de semana, $30 envío ──
  '11000': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11010': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11020': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11030': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11040': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11050': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11100': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11200': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11210': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11220': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11700': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11800': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11850': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11860': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11870': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11900': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11910': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11920': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11930': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11940': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  '11950': { zone: 'Chapultepec',    cost: 30, days: 'weekends' },
  // ── Reforma (Cuauhtémoc, CDMX) — fin de semana, $30 envío ──
  '06010': { zone: 'Reforma',        cost: 30, days: 'weekends' },
  '06020': { zone: 'Reforma',        cost: 30, days: 'weekends' },
  '06030': { zone: 'Reforma',        cost: 30, days: 'weekends' },
  '06040': { zone: 'Reforma',        cost: 30, days: 'weekends' },
  '06050': { zone: 'Reforma',        cost: 30, days: 'weekends' },
  '06100': { zone: 'Reforma',        cost: 30, days: 'weekends' },
  '06500': { zone: 'Reforma',        cost: 30, days: 'weekends' },
  '06600': { zone: 'Reforma',        cost: 30, days: 'weekends' },
  '06700': { zone: 'Reforma',        cost: 30, days: 'weekends' },
  '06720': { zone: 'Reforma',        cost: 30, days: 'weekends' },
};

const PRODUCT_HIGHLIGHTS = {
  'zanahoria':          ['Húmedo y esponjoso', 'Betún de queso crema', 'Toque de canela y especias', 'Hecho desde cero', 'Sin conservadores'],
  'naranja-cajeta':     ['Cítrico y dulce a la vez', 'Cajeta mexicana artesanal', 'Bizcocho suave y aromático', 'Receta artesanal', 'Horneado el mismo día'],
  'platano-chispas':    ['Plátano maduro natural', 'Chispas de chocolate en cada mordida', 'Húmedo por dentro', 'Sin mezclas industriales', 'El favorito de los que lo prueban'],
  'chocolate-frutos':   ['Chocolate intenso', 'Frutos rojos frescos', 'Betún suave y cremoso', 'Hecho desde cero', 'Perfecto para celebrar'],
  'cheesecake-guayaba': ['Cremoso y suave', 'Sabor intenso a guayaba', 'Base crujiente de galleta', 'Sin conservadores', 'Dulce pero no empalagoso'],
  'brownie-caramelo':   ['Chocolate intenso con cajeta', 'Suave por dentro, firme por fuera', 'Sabor a caramelo en cada bocado', 'Ingredientes frescos', 'El más pedido para regalar'],
};

const MIN_ADVANCE_DAYS = 4; // días calendario mínimos de anticipación

function getMinDeliveryDate() {
  const now = new Date();
  // Usamos fecha local para evitar desfase UTC (en México new Date().toISOString() puede dar mañana)
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + MIN_ADVANCE_DAYS);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isValidDeliveryDate(dateStr, zoneDays) {
  if (!dateStr) return true;
  const day = new Date(dateStr + 'T12:00:00').getDay();
  if (zoneDays === 'weekends') return day === 0 || day === 6;
  return true;
}

// ── Helpers de pago ───────────────────────────────────────────────────────────

function loadPayPalSDK(clientId) {
  return new Promise((resolve, reject) => {
    if (window.paypal) { resolve(); return; }
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=MXN&locale=es_MX&enable-funding=card&intent=capture`;
    s.onload  = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar el SDK de PayPal.'));
    document.head.appendChild(s);
  });
}

function PayPalButtonsWidget({ orderId, onSuccess, onError, onCancel }) {
  const containerRef = useRef(null);
  useEffect(() => {
    let mounted = true;
    let buttons = null;
    (async () => {
      try {
        const cfg      = await fetch('/api/paypal-config').then(r => r.json());
        await loadPayPalSDK(cfg.clientId);
        if (!mounted || !containerRef.current) return;
        buttons = window.paypal.Buttons({
          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
          createOrder: async () => {
            const res  = await fetch('/api/payments/create-order', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al iniciar el pago.');
            return data.paypalOrderId;
          },
          onApprove: async (pd) => {
            const res  = await fetch('/api/payments/capture-order', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId, paypalOrderId: pd.orderID })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al confirmar el pago.');
            if (mounted) onSuccess(data);
          },
          onError:  ()  => onError('Ocurrió un error en PayPal. Intenta de nuevo.'),
          onCancel: ()  => onCancel(),
        });
        if (mounted && containerRef.current) buttons.render(containerRef.current);
      } catch (err) {
        if (mounted) onError(err.message || 'Error al cargar PayPal.');
      }
    })();
    return () => { mounted = false; try { if (buttons) buttons.close(); } catch {} };
  }, [orderId]);
  return React.createElement('div', { ref: containerRef, style: { minHeight: '120px' } });
}

function OrderSummary({ product, form, pendingOrder, shippingCost, total, onPaymentSuccess, onBack }) {
  const [payError, setPayError]           = useState('');
  const [cancelled, setCancelled]         = useState(false);
  const row = (label, value) => React.createElement('div', { className: 'summary-row' },
    React.createElement('span', null, label),
    React.createElement('span', null, value)
  );
  return React.createElement('div', { className: 'order-summary-screen' },
    React.createElement('h2', null, '📋 Resumen de tu pedido'),
    React.createElement('p', { className: 'hint', style: { marginBottom: '1rem' } },
      'Revisa los detalles antes de pagar. Si algo no es correcto, puedes regresar.'
    ),
    React.createElement('div', { className: 'summary-card' },
      row('Folio', React.createElement('strong', null, pendingOrder.folio)),
      row('Producto', `${product.name} × ${form.quantity}`),
      row('Fecha de entrega', form.deliveryDate || 'Por confirmar'),
      row('Zona de entrega', pendingOrder.zone || form.zone || 'Por definir'),
      shippingCost > 0 ? row('Costo de envío', formatCurrency(shippingCost)) : null,
      React.createElement('div', { className: 'summary-row summary-total' },
        React.createElement('span', null, 'Total a pagar'),
        React.createElement('strong', { style: { color: '#d66aa7', fontSize: '1.2rem' } }, formatCurrency(total))
      )
    ),
    payError
      ? React.createElement('div', { className: 'pay-error-box' },
          `⚠️ ${payError}`,
          React.createElement('br', null),
          React.createElement('button', { style: { marginTop: '0.5rem' }, onClick: () => { setPayError(''); setCancelled(false); } }, 'Intentar de nuevo')
        )
      : React.createElement('div', { className: 'paypal-wrapper' },
          React.createElement('p', { className: 'hint', style: { textAlign: 'center', marginBottom: '0.6rem' } },
            '🔒 Pago seguro — puedes pagar con tarjeta sin necesidad de tener cuenta PayPal'
          ),
          React.createElement(PayPalButtonsWidget, {
            orderId:   pendingOrder.id,
            onSuccess: onPaymentSuccess,
            onError:   msg => setPayError(msg),
            onCancel:  () => setCancelled(true),
          }),
          cancelled
            ? React.createElement('p', { className: 'hint', style: { textAlign: 'center', marginTop: '0.5rem' } },
                'Cancelaste el pago. Puedes intentarlo de nuevo cuando quieras.')
            : null
        ),
    React.createElement('button', {
      style: { marginTop: '1.25rem', display: 'block' },
      onClick: onBack
    }, '← Modificar mi pedido')
  );
}

function InlinePayPalWidget({ orderDataRef, onSuccess }) {
  const containerRef = useRef(null);
  const pendingOrderRef = useRef(null);
  const [payError, setPayError] = useState('');
  const [cancelMsg, setCancelMsg] = useState('');

  useEffect(() => {
    let mounted = true;
    let buttons = null;
    (async () => {
      try {
        const cfg = await fetch('/api/paypal-config').then(r => r.json());
        await loadPayPalSDK(cfg.clientId);
        if (!mounted || !containerRef.current) return;
        buttons = window.paypal.Buttons({
          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
          createOrder: async () => {
            setPayError(''); setCancelMsg('');
            if (pendingOrderRef.current) {
              const r = await fetch('/api/payments/create-order', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: pendingOrderRef.current.id })
              });
              const d = await r.json();
              if (!r.ok) throw new Error(d.error || 'Error al iniciar el pago.');
              return d.paypalOrderId;
            }
            const { form, selectedProduct, selectedZone, zipOutOfZone } = orderDataRef.current;
            const quantity = Number(form.quantity) || 1;
            const deliveryCost = selectedZone ? selectedZone.cost : 0;
            const total = (selectedProduct.fullPrice * quantity) + deliveryCost;
            const deliveryDate = form.deliveryTime ? `${form.deliveryDate} ${form.deliveryTime}` : form.deliveryDate;
            const fullAddress = [form.address, form.colonia, form.municipio, form.zipCode, form.estado].filter(Boolean).join(', ');
            const notesWithZone = deliveryCost > 0 ? `[Envío $${deliveryCost}]${form.notes ? ' ' + form.notes : ''}` : form.notes;
            const orderRes = await fetch('/api/orders', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customerName: form.customerName, phone: form.whatsapp, email: form.email,
                whatsapp: form.whatsapp,
                zone: zipOutOfZone ? `CP ${form.zipCode} (fuera de cobertura)` : form.zone,
                address: fullAddress,
                item: { ...selectedProduct, recipeId: selectedProduct.id },
                quantity, total,
                estimatedCost: (selectedProduct.estimatedCost || 0) * quantity,
                advancePaid: Math.round(total * 0.5),
                deliveryDate, notes: notesWithZone,
                requestedItems: [{ name: selectedProduct.name, quantity }],
                createdAt: new Date().toISOString().slice(0, 10)
              })
            });
            if (!orderRes.ok) { const e = await orderRes.json(); throw new Error(e.error || 'Error al registrar el pedido.'); }
            const newOrder = await orderRes.json();
            pendingOrderRef.current = { ...newOrder, shippingCost: deliveryCost, total };
            const payRes = await fetch('/api/payments/create-order', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: newOrder.id })
            });
            const payData = await payRes.json();
            if (!payRes.ok) throw new Error(payData.error || 'Error al iniciar el pago.');
            return payData.paypalOrderId;
          },
          onApprove: async (pd) => {
            const pending = pendingOrderRef.current;
            if (!pending) return;
            const res = await fetch('/api/payments/capture-order', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: pending.id, paypalOrderId: pd.orderID })
            });
            const data = await res.json();
            if (!res.ok) { if (mounted) setPayError(data.error || 'Error al confirmar el pago. Contacta soporte.'); return; }
            if (mounted) onSuccess(data, pending);
          },
          onError: () => { if (mounted) setPayError('Ocurrió un error con PayPal. Verifica tus datos e intenta de nuevo.'); },
          onCancel: () => { if (mounted) setCancelMsg('Cancelaste el pago. Puedes intentarlo cuando quieras.'); }
        });
        if (mounted && containerRef.current) buttons.render(containerRef.current);
      } catch (err) {
        if (mounted) setPayError(err.message || 'Error al cargar el botón de pago.');
      }
    })();
    return () => { mounted = false; try { if (buttons) buttons.close(); } catch {} };
  }, []);

  return React.createElement('div', { className: 'form-paypal-section' },
    React.createElement('p', { style: { textAlign: 'center', marginBottom: '0.4rem', fontSize: '0.83rem', color: '#3d2230' } },
      '🔒 Pago seguro — puedes pagar con tarjeta sin necesidad de cuenta PayPal'
    ),
    payError ? React.createElement('div', { className: 'pay-error-box', style: { marginBottom: '0.6rem' } },
      `⚠️ ${payError}`,
      React.createElement('button', { style: { marginTop: '0.5rem', fontSize: '0.82rem', display: 'block' }, onClick: () => setPayError('') }, 'Cerrar')
    ) : null,
    React.createElement('div', { ref: containerRef, style: { minHeight: '110px' } }),
    cancelMsg ? React.createElement('p', { className: 'hint', style: { textAlign: 'center', marginTop: '0.35rem', fontSize: '0.83rem' } }, cancelMsg) : null
  );
}

function CustomerPortal({ catalog, siteConfig, onNavigate }) {
  const EMPTY_FORM = { customerName: '', email: '', whatsapp: '', address: '', zipCode: '', colonia: '', municipio: '', estado: '', zone: '', quantity: 1, deliveryDate: '', deliveryTime: '', notes: '' };

  const [tab, setTab] = useState('order');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [dateError, setDateError] = useState('');
  const [zipOutOfZone, setZipOutOfZone] = useState(false);
  const [emailError, setEmailError] = useState('');
  const orderDataRef = useRef(null);

  const validateEmail = (value) => {
    if (!value) { setEmailError(''); return; }
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
    setEmailError(ok ? '' : 'Escribe un correo válido, ej. nombre@dominio.com');
  };

  // Hook que recuerda el folio buscado, el pedido encontrado y el mensaje de resultado.
  const { folioInput, setFolioInput, trackedOrder, trackMessage, handleSearch, handleCancel } = useFolioTracker();

  useEffect(() => {
    if (!catalog.length) return;
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('producto');
    if (productId) {
      const found = catalog.find(p => p.id === productId);
      if (found) setSelectedProduct(found);
    }
  }, [catalog]);

  const selectedZone = DELIVERY_ZONES.find((z) => z.label === form.zone) || null;

  const handleZoneChange = (zoneLabel) => {
    const zone = DELIVERY_ZONES.find((z) => z.label === zoneLabel) || null;
    const dateOk = zone ? isValidDeliveryDate(form.deliveryDate, zone.days) : true;
    setForm({ ...form, zone: zoneLabel, deliveryDate: dateOk ? form.deliveryDate : '' });
    setDateError('');
  };

  const handleDateChange = (dateStr) => {
    if (selectedZone && !isValidDeliveryDate(dateStr, selectedZone.days)) {
      setDateError('Esta zona solo tiene entregas en sábado y domingo.');
      setForm({ ...form, deliveryDate: '' });
    } else {
      setDateError('');
      setForm({ ...form, deliveryDate: dateStr });
    }
  };

  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    setConfirmedOrder(null);
  };

  orderDataRef.current = { form, selectedProduct, selectedZone, zipOutOfZone, emailError };

  const formIsValid = !!(
    selectedProduct &&
    form.customerName.trim() &&
    form.email.trim() && !emailError &&
    form.whatsapp.trim() &&
    form.address.trim() &&
    form.zipCode.trim() &&
    form.colonia.trim() &&
    form.municipio.trim() &&
    form.estado.trim() &&
    form.deliveryDate &&
    (form.zone || zipOutOfZone)
  );

  const tabBtn = (id, label) => React.createElement('button', {
    className: tab === id ? 'tab-btn active' : 'tab-btn',
    onClick: () => setTab(id)
  }, label);

  return React.createElement('div', { className: 'customer-portal' },
    React.createElement('div', { className: 'portal-topbar' },
      React.createElement('button', { className: 'portal-back-btn', onClick: () => onNavigate('/') }, '← Inicio')
    ),
    React.createElement('section', { className: 'card full-width' },
      React.createElement('div', { className: 'tab-row' },
        tabBtn('order', 'Hacer un pedido'),
        tabBtn('track', 'Rastrear mi pedido')
      ),

      tab === 'order' ? React.createElement('div', null,
        confirmedOrder
          ? React.createElement('div', { className: 'confirmed-banner' },
              React.createElement('div', { className: 'payment-confirmed-badge' }, '✅ ¡Pago confirmado!'),
              React.createElement('h3', null, `¡Tu pedido está confirmado, ${(confirmedOrder.customerName || '').split(' ')[0] || 'cliente'}!`),
              React.createElement('p', null, 'Gracias por tu compra en Gerbera Bakery 🌸'),
              React.createElement('p', null, 'Guarda este folio para rastrear tu pedido:'),
              React.createElement('div', { className: 'folio-display' }, confirmedOrder.folio),
              React.createElement('div', { className: 'payment-summary-mini' },
                confirmedOrder.productName ? React.createElement('p', null, `Producto: ${confirmedOrder.productName}`) : null,
                confirmedOrder.deliveryDate ? React.createElement('p', null, `Entrega: ${confirmedOrder.deliveryDate}`) : null,
                confirmedOrder.zone ? React.createElement('p', null, `Zona: ${confirmedOrder.zone}`) : null,
                confirmedOrder.amount ? React.createElement('p', null, `Total pagado: ${formatCurrency(confirmedOrder.amount)}`) : null,
                confirmedOrder.transactionId
                  ? React.createElement('p', { className: 'hint', style: { fontSize: '0.8rem' } }, `Ref. PayPal: ${confirmedOrder.transactionId}`)
                  : null
              ),
              React.createElement('p', { className: 'hint' }, 'Te enviamos un correo de confirmación con todos los detalles.'),
              React.createElement('button', { onClick: () => setConfirmedOrder(null) }, 'Hacer otro pedido')
            )
          : React.createElement('div', { className: 'order-layout' },
          React.createElement('div', { className: 'catalog-column' },
            React.createElement('h2', null, 'Elige tu producto'),
            React.createElement('div', { className: 'product-grid' },
              /* Loop: recorre todos los productos del catálogo y genera una tarjeta por cada uno en el portal del cliente */
              catalog.map((product) => React.createElement('article', {
                key: product.id,
                className: 'product-card' + (selectedProduct?.id === product.id ? ' selected' : ''),
                onClick: () => handleSelectProduct(product)
              },
                React.createElement('img', { src: product.image, alt: product.name }),
                React.createElement('h3', null, product.name),
                React.createElement('p', null, product.description),
                React.createElement('div', { className: 'product-price-row' },
                  React.createElement('span', null, 'Precio: ', React.createElement('strong', null, formatCurrency(product.fullPrice)))
                )
              ))
            )
          ),
          React.createElement('div', { className: 'order-sidebar' },
            selectedProduct ? React.createElement('div', { className: 'order-form-panel' },
              React.createElement('h2', null, `Pedido: ${selectedProduct.name}`),
              React.createElement('form', { onSubmit: e => e.preventDefault(), className: 'stack' },
                React.createElement('label', null, 'Nombre completo'),
                React.createElement('input', { required: true, placeholder: 'Tu nombre', value: form.customerName, onChange: (e) => setForm({ ...form, customerName: e.target.value }) }),
                React.createElement('label', null, 'WhatsApp'),
                React.createElement('input', { required: true, placeholder: 'Ej. 55 1234 5678', value: form.whatsapp, onChange: (e) => setForm({ ...form, whatsapp: e.target.value }) }),
                React.createElement('label', null, 'Correo electrónico'),
                React.createElement('input', {
                  required: true,
                  type: 'email',
                  placeholder: 'tu@correo.com',
                  value: form.email,
                  className: emailError ? 'input-error' : '',
                  onChange: (e) => {
                    setForm({ ...form, email: e.target.value });
                    validateEmail(e.target.value);
                  }
                }),
                emailError
                  ? React.createElement('p', { className: 'field-error' }, emailError)
                  : null,
                React.createElement('label', null, 'Zona de entrega'),
                React.createElement('select', { required: !zipOutOfZone, value: form.zone, onChange: (e) => handleZoneChange(e.target.value) },
                  React.createElement('option', { value: '' }, '— Selecciona tu zona —'),
                  React.createElement('optgroup', { label: 'Sin costo de envío' },
                    DELIVERY_ZONES.filter((z) => z.cost === 0).map((z) =>
                      React.createElement('option', { key: z.label, value: z.label }, z.label)
                    )
                  ),
                  React.createElement('optgroup', { label: 'Con costo de envío ($35)' },
                    DELIVERY_ZONES.filter((z) => z.cost > 0).map((z) =>
                      React.createElement('option', { key: z.label, value: z.label }, z.label)
                    )
                  )
                ),
                selectedZone ? React.createElement('p', { className: 'zone-info hint' },
                  selectedZone.cost > 0 ? `Costo de envío: $${selectedZone.cost}` : 'Envío sin costo',
                  ' · ',
                  selectedZone.days === 'all' ? 'Entrega cualquier día' : 'Entrega solo sábados y domingos'
                ) : null,
                React.createElement('div', { className: 'address-section' },
                  React.createElement('p', { className: 'address-section-title' }, 'Dirección de entrega'),
                  React.createElement('label', null, 'Calle y número'),
                  React.createElement('input', { required: true, placeholder: 'Ej. Av. Jardines 123 Int. 4', value: form.address, onChange: (e) => setForm({ ...form, address: e.target.value }) }),
                  React.createElement('label', null, 'Colonia'),
                  React.createElement('input', { required: true, placeholder: 'Ej. Zona Esmeralda', value: form.colonia, onChange: (e) => setForm({ ...form, colonia: e.target.value }) }),
                  React.createElement('label', null, 'Código postal'),
                  React.createElement('input', {
                  required: true,
                  placeholder: '52938',
                  maxLength: 5,
                  value: form.zipCode,
                  onChange: (e) => {
                    const zip = e.target.value.replace(/\D/g, '').slice(0, 5);
                    if (zip.length === 5) {
                      const match = ZIP_ZONE_MAP[zip];
                      if (match) {
                        setZipOutOfZone(false);
                        setForm(prev => ({ ...prev, zipCode: zip, zone: match.zone }));
                        setDateError('');
                      } else {
                        setZipOutOfZone(true);
                        setForm(prev => ({ ...prev, zipCode: zip, zone: '' }));
                      }
                    } else {
                      setZipOutOfZone(false);
                      setForm(prev => ({ ...prev, zipCode: zip }));
                    }
                  }
                }),
                form.zipCode.length === 5 && !zipOutOfZone && ZIP_ZONE_MAP[form.zipCode]
                  ? React.createElement('p', { className: 'zip-detected-success' },
                      `✓ Zona detectada automáticamente: ${form.zone}`
                    )
                  : null,
                zipOutOfZone
                  ? React.createElement('div', { className: 'zip-not-found-alert' },
                      React.createElement('strong', null, '⚠️ Tu código postal está fuera de nuestras zonas de entrega actuales.'),
                      React.createElement('p', null,
                        'Puedes continuar con tu pedido y nos pondremos en contacto contigo. ',
                        React.createElement('strong', null, 'Zonas con cobertura: '),
                        'Satélite, Lomas Verdes, San Mateo, Zona Esmeralda, Polanco, Reforma y Chapultepec.'
                      )
                    )
                  : null,
                  React.createElement('div', { className: 'address-row' },
                    React.createElement('div', null,
                      React.createElement('label', null, 'Municipio / Alcaldía'),
                      React.createElement('input', { required: true, placeholder: 'Ej. Atizapán', value: form.municipio, onChange: (e) => setForm({ ...form, municipio: e.target.value }) })
                    ),
                    React.createElement('div', null,
                      React.createElement('label', null, 'Estado'),
                      React.createElement('input', { required: true, placeholder: 'Ej. Estado de México', value: form.estado, onChange: (e) => setForm({ ...form, estado: e.target.value }) })
                    )
                  )
                ),
                React.createElement('label', null, 'Cantidad'),
                React.createElement('input', { type: 'number', min: '1', value: form.quantity, onChange: (e) => setForm({ ...form, quantity: e.target.value }) }),
                React.createElement('p', { className: 'hint' }, `Total: ${formatCurrency(selectedProduct.fullPrice * Number(form.quantity) + (selectedZone ? selectedZone.cost : 0))}`),
                React.createElement('label', null, 'Fecha de entrega'),
                React.createElement('p', { className: 'hint', style: { margin: '0' } }, 'Los pedidos requieren mínimo 4 días de anticipación.'),
                React.createElement('input', { required: true, type: 'date', min: getMinDeliveryDate(), value: form.deliveryDate, onChange: (e) => handleDateChange(e.target.value) }),
                dateError ? React.createElement('p', { className: 'hint', style: { color: '#b33f58' } }, dateError) : null,
                React.createElement('label', null, 'Hora de entrega'),
                React.createElement('input', { type: 'time', value: form.deliveryTime, onChange: (e) => setForm({ ...form, deliveryTime: e.target.value }) }),
                React.createElement('label', null, 'Notas adicionales'),
                React.createElement('textarea', { rows: 3, placeholder: 'Alergias, dedicatorias, instrucciones especiales…', value: form.notes, onChange: (e) => setForm({ ...form, notes: e.target.value }) }),
                React.createElement('p', { style: { margin: '0.5rem 0 0', fontWeight: 700, color: '#4f2d3d', textAlign: 'right', fontSize: '1.05rem' } },
                  'Total: ', React.createElement('strong', { style: { color: '#d66aa7', fontSize: '1.2rem' } },
                    formatCurrency((selectedProduct.fullPrice * Number(form.quantity || 1)) + (selectedZone ? selectedZone.cost : 0))
                  )
                ),
                React.createElement('div', { className: 'form-paypal-outer' },
                  !formIsValid ? React.createElement('div', { className: 'form-paypal-overlay' },
                    React.createElement('p', null, '⬆ Completa todos los campos para continuar al pago')
                  ) : null,
                  React.createElement(InlinePayPalWidget, {
                    orderDataRef,
                    onSuccess: (txnData, pending) => {
                      setConfirmedOrder({ ...pending, ...txnData, ...txnData.order });
                      setSelectedProduct(null);
                      setForm(EMPTY_FORM);
                      setDateError('');
                    }
                  })
                )
              )
            ) : React.createElement('div', { className: 'order-sidebar-placeholder' },
              React.createElement('p', null, 'Selecciona un producto del catálogo para continuar con tu pedido.')
            )
          )
        )
      ) : null,

      tab === 'track' ? React.createElement('div', null,
        React.createElement('h2', null, 'Rastrear pedido'),
        React.createElement('p', null, 'Ingresa el folio que recibiste al hacer tu pedido.'),
        React.createElement('div', { className: 'row' },
          React.createElement('input', { placeholder: 'Ej. GB-1001', value: folioInput, onChange: (e) => setFolioInput(e.target.value) }),
          React.createElement('button', { onClick: handleSearch }, 'Buscar')
        ),
        trackMessage ? React.createElement('p', { className: 'hint' }, trackMessage) : null,
        trackedOrder ? React.createElement('div', { className: 'panel' },
          React.createElement('h3', null, `Pedido ${trackedOrder.folio}`),
          React.createElement('p', null, `Estado: ${trackedOrder.status}`),
          React.createElement('p', null, `Entrega: ${trackedOrder.deliveryDate || 'Por confirmar'}`),
          React.createElement('div', { className: 'timeline' },
            STATUS_FLOW.map((step) => React.createElement('span', { key: step, className: getStatusIndex(trackedOrder.status) >= getStatusIndex(step) ? 'chip active' : 'chip' }, step))
          ),
          trackedOrder.status !== 'Cancelado' && trackedOrder.status !== 'Entregado'
            ? React.createElement('button', { onClick: handleCancel, className: 'danger' }, 'Cancelar pedido')
            : React.createElement('p', { className: 'hint' }, 'Este pedido ya no puede modificarse.')
        ) : null
      ) : null
    ),
  );
}

function AdminView({ orders: allOrders, catalog, siteConfig, onRefresh, onSaveConfig, onLogout, onRefreshCatalog, newOrderAlert, onClearNewOrderAlert }) {
  const [adminTab, setAdminTab] = useState('pedidos');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [dateFilter, setDateFilter] = useState('');
  const [adminMessage, setAdminMessage] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [showNewOrderBanner, setShowNewOrderBanner] = useState(false);
  const [newAddressInput, setNewAddressInput] = useState('');
  const [newZipInput, setNewZipInput] = useState('');
  const [notifying, setNotifying] = useState(false);
  const [msgType, setMsgType] = useState('confirmacion');
  const [extraNote, setExtraNote] = useState('');
  const [generatedMsg, setGeneratedMsg] = useState('');
  const [generatingMsg, setGeneratingMsg] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });

  useEffect(() => {
    if (!newOrderAlert) return;
    setShowNewOrderBanner(true);
    const t = setTimeout(() => setShowNewOrderBanner(false), 8000);
    return () => clearTimeout(t);
  }, [newOrderAlert]);

  // Limpia el panel IA al cambiar de pedido seleccionado
  useEffect(() => {
    setGeneratedMsg('');
    setExtraNote('');
    setMsgType('confirmacion');
  }, [selectedOrderId]);

  const orders = allOrders.filter((order) => {
    const matchesStatus = statusFilter === 'Todos' || order.status === statusFilter;
    const matchesDate = !dateFilter || order.deliveryDate === dateFilter;
    return matchesStatus && matchesDate;
  });

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || orders[0] || null;
  const statusCounts = buildStatusCounts(orders);
  const weeklyOrders = orders.filter((order) => order.createdAt && order.createdAt >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const estimatedIncome = orders.filter((order) => order.status !== 'Cancelado').reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const newCustomers = new Set(orders.map((order) => order.customerName)).size;
  const outOfZoneCount = allOrders.filter(o => o.status === OUT_OF_ZONE_STATUS || o.status === RESPONDED_STATUS).length;

  const customerHistory = (() => {
    const map = new Map();
    allOrders.forEach((order) => {
      const entry = map.get(order.customerName) || { customerName: order.customerName, phone: order.phone, orders: 0, lastStatus: order.status };
      entry.orders += 1;
      entry.lastStatus = order.status;
      map.set(order.customerName, entry);
    });
    return Array.from(map.values());
  })();

  const today = new Date().toISOString().slice(0, 10);
  const monthLabel = (() => {
    const s = new Date(calMonth.year, calMonth.month)
      .toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();
  const prevMonth = () => setCalMonth(({ year, month }) => {
    const d = new Date(year, month - 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const nextMonth = () => setCalMonth(({ year, month }) => {
    const d = new Date(year, month + 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  // Pre-agrupamos pedidos por fecha para que el grid no haga filter×42
  const ordersByDate = (() => {
    const map = new Map();
    for (const o of allOrders) {
      if (!o.deliveryDate) continue;
      const key = o.deliveryDate.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(o);
    }
    return map;
  })();

  const monthCells = (() => {
    const firstDay = new Date(calMonth.year, calMonth.month, 1);
    const dow = firstDay.getDay();
    const offset = dow === 0 ? 6 : dow - 1;
    const gridStart = new Date(firstDay);
    gridStart.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      return {
        dateStr,
        dayNum: d.getDate(),
        inMonth: d.getMonth() === calMonth.month,
        isToday: dateStr === today,
        deliveries: ordersByDate.get(dateStr) || []
      };
    });
  })();

  const confirmOrder = async (order) => {
    const deliveryDate = window.prompt('Fecha de entrega (YYYY-MM-DD)', order.deliveryDate || '');
    if (!deliveryDate) return;
    await adminFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Confirmado', deliveryDate })
    });
    await onRefresh();
    setAdminMessage(`Pedido ${order.folio} confirmado.`);
  };

  const changeStatus = async (order, nextStatus) => {
    await adminFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus })
    });
    await onRefresh();
    setAdminMessage(`Estado actualizado a ${nextStatus}.`);
  };

  const buildWaMessage = (order) =>
    `Hola ${order.customerName}, gracias por tu pedido en Gerbera Bakery 🌸 Revisamos tu código postal y lamentablemente por el momento no contamos con cobertura de entrega en tu zona.\n\nNuestras zonas de entrega son:\n✅ Sin costo de envío:\n· Naucalpan: Satélite, Lomas Verdes, San Mateo\n· Atizapán: Zona Esmeralda\n\n🚗 Con costo de envío ($50):\n· CDMX: Polanco, Reforma, Chapultepec\n\n¿Tienes alguna dirección de entrega dentro de estas zonas? Con gusto coordinamos tu pedido. Si no es posible, podemos cancelarlo sin ningún costo para ti.`;

  const handleNotifyZone = async (order, method) => {
    setNotifying(true);
    try {
      if (method === 'whatsapp') {
        const cleaned = (order.whatsapp || order.phone || '').replace(/\D/g, '');
        const fullPhone = cleaned.startsWith('52') ? cleaned : `52${cleaned}`;
        window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(buildWaMessage(order))}`, '_blank');
      }
      await adminFetch(`/api/orders/${order.id}/notify-zone`, {
        method: 'POST',
        body: JSON.stringify({ method })
      });
      await onRefresh();
      setAdminMessage(method === 'whatsapp'
        ? `Enlace de WhatsApp abierto. La notificación quedó registrada para ${order.folio}.`
        : `Correo enviado a ${order.email || 'cliente'} — pedido ${order.folio}.`);
    } catch {
      setAdminMessage('Error al enviar la notificación.');
    } finally {
      setNotifying(false);
    }
  };

  const handleClientResponded = async (order) => {
    const now = new Date().toISOString().slice(0, 19);
    await adminFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: RESPONDED_STATUS, respondedAt: now })
    });
    await onRefresh();
    setAdminMessage(`Pedido ${order.folio} marcado como Respondido.`);
  };

  const handleConfirmNewAddress = async (order) => {
    if (!newAddressInput.trim() || !newZipInput.trim()) return;
    const zipMatch = ZIP_ZONE_MAP[newZipInput.trim()];
    const newZone  = zipMatch ? zipMatch.zone : newZipInput.trim();
    await adminFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ address: newAddressInput.trim(), zone: newZone, status: 'Recibido' })
    });
    await onRefresh();
    setNewAddressInput('');
    setNewZipInput('');
    setAdminMessage(`Nueva dirección confirmada. Pedido ${order.folio} movido a "Recibido".`);
  };

  const handleCancelFromZonePanel = async (order) => {
    await adminFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Cancelado' })
    });
    await onRefresh();
    setAdminMessage(`Pedido ${order.folio} cancelado.`);
  };

  const handleGenerateMessage = async (order) => {
    setGeneratingMsg(true);
    setGeneratedMsg('');
    try {
      const res  = await adminFetch(`/api/orders/${order.id}/generate-message`, {
        method: 'POST',
        body: JSON.stringify({ messageType: msgType, extraNote })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error del servidor');
      setGeneratedMsg(data.message || '');
    } catch (e) {
      setAdminMessage(`Error al generar el mensaje: ${e.message}`);
    } finally {
      setGeneratingMsg(false);
    }
  };

  const handleSendMessage = async (order) => {
    try {
      const res = await adminFetch(`/api/orders/${order.id}/send-message`, {
        method: 'POST',
        body: JSON.stringify({ message: generatedMsg })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error del servidor');
      }
      setAdminMessage(`Mensaje enviado por correo a ${order.email}.`);
    } catch (e) {
      setAdminMessage(`Error al enviar el mensaje: ${e.message}`);
    }
  };

  const handleSaveCatalog = async (newCatalog) => {
    await adminFetch('/api/catalog', {
      method: 'PUT',
      body: JSON.stringify(newCatalog)
    });
    await onRefresh();
    if (onRefreshCatalog) await onRefreshCatalog();
  };

  const adminTabBtn = (id, label) => React.createElement('button', {
    className: 'tab-btn' + (adminTab === id ? ' active' : ''),
    onClick: () => {
      setAdminTab(id);
      if (id === 'pedidos' && onClearNewOrderAlert) onClearNewOrderAlert();
    }
  },
    id === 'pedidos' && newOrderAlert
      ? React.createElement('span', { className: 'new-order-tab-label' },
          label,
          React.createElement('span', { className: 'new-order-dot' })
        )
      : label
  );

  return React.createElement('div', { className: 'admin-view-wrap' },
    React.createElement('div', { className: 'admin-topbar' },
      React.createElement('div', { className: 'admin-tab-row' },
        adminTabBtn('pedidos', 'Pedidos'),
        adminTabBtn('paginas', 'Gestión de páginas'),
        adminTabBtn('redes', 'Redes sociales')
      ),
      React.createElement('button', { onClick: onLogout }, 'Cerrar sesión')
    ),
    showNewOrderBanner && React.createElement('div', { className: 'new-order-banner' },
      React.createElement('span', null, '🎉 ¡Nuevo pedido recibido!'),
      React.createElement('button', {
        className: 'new-order-banner-btn',
        onClick: () => {
          setAdminTab('pedidos');
          if (onClearNewOrderAlert) onClearNewOrderAlert();
          setShowNewOrderBanner(false);
        }
      }, 'Ver pedidos →')
    ),
    adminTab === 'paginas' ? React.createElement('div', { className: 'admin-shell' },
      React.createElement(CatalogEditor, { catalog, onSaveCatalog: handleSaveCatalog }),
      React.createElement(ContentEditor, { catalog, siteConfig, onSaveCatalog: handleSaveCatalog, onSaveConfig })
    ) : null,
    adminTab === 'redes' ? React.createElement('div', { className: 'admin-shell' },
      React.createElement(SocialContent, {})
    ) : null,
    adminTab === 'pedidos' ? React.createElement('div', { className: 'admin-shell' },
    React.createElement(
      'section',
      { className: 'card full-width dashboard-card' },
      React.createElement('h2', null, 'Dashboard'),
      React.createElement('div', { className: 'dashboard-grid' },
        React.createElement('div', { className: 'dashboard-chart' },
          React.createElement('h3', null, 'Pedidos por estatus'),
          /* Loop: recorre los 7 estados del flujo y genera una barra de progreso por estado en el dashboard */
          React.createElement('div', { className: 'bar-chart' }, STATUS_FLOW.map((status) => React.createElement('div', { key: status, className: 'bar-row' },
            React.createElement('span', null, status),
            React.createElement('div', { className: 'bar-track' },
              React.createElement('div', { className: 'bar-fill', style: { width: `${Math.max(8, (statusCounts[status] / Math.max(1, orders.length)) * 100)}%` } })
            ),
            React.createElement('strong', null, statusCounts[status])
          )))
        ),
        React.createElement('div', { className: 'dashboard-metrics' },
          React.createElement('div', { className: 'metric-card' }, React.createElement('span', null, 'Pedidos esta semana'), React.createElement('strong', null, weeklyOrders.length)),
          React.createElement('div', { className: 'metric-card' }, React.createElement('span', null, 'Ingresos estimados'), React.createElement('strong', null, formatCurrency(estimatedIncome))),
          React.createElement('div', { className: 'metric-card' }, React.createElement('span', null, 'Costo estimado total'), React.createElement('strong', null, formatCurrency(orders.reduce((sum, order) => sum + (Number(order.estimatedCost) || 0), 0)))),
          React.createElement('div', { className: 'metric-card' }, React.createElement('span', null, 'Clientes nuevos'), React.createElement('strong', null, newCustomers)),
          outOfZoneCount > 0
            ? React.createElement('div', { className: 'metric-card metric-card-alert' },
                React.createElement('span', null, '⚠️ CP fuera de cobertura'),
                React.createElement('strong', null, outOfZoneCount)
              )
            : null
        )
      )
    ),
    React.createElement(
      'section',
      { className: 'card' },
      React.createElement('h2', null, 'Panel administrador'),
      React.createElement('p', null, 'Gestiona pedidos, entregas y producción desde una sola vista.'),
      React.createElement('div', { className: 'row' },
        React.createElement('select', { value: statusFilter, onChange: (event) => setStatusFilter(event.target.value) },
          React.createElement('option', { value: 'Todos' }, 'Todos'),
          STATUS_FLOW.filter((status) => status !== 'Cancelado').map((status) => React.createElement('option', { key: status, value: status }, status)),
          React.createElement('option', { value: OUT_OF_ZONE_STATUS }, '⚠️ CP fuera de cobertura'),
          React.createElement('option', { value: RESPONDED_STATUS }, '✅ Respondido')
        ),
        React.createElement('input', { type: 'date', value: dateFilter, onChange: (event) => setDateFilter(event.target.value) })
      ),
      adminMessage ? React.createElement('p', { className: 'hint' }, adminMessage) : null,
      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Folio'),
              React.createElement('th', null, 'Cliente'),
              React.createElement('th', null, 'Estado'),
              React.createElement('th', null, 'Entrega'),
              React.createElement('th', null, 'Acciones')
            )
          ),
          React.createElement('tbody', null,
            /* Loop: recorre todos los pedidos (ya filtrados por estado/fecha) y genera una fila por cada uno en la tabla del admin */
            orders.map((order) => {
              const isSpecial  = order.status === OUT_OF_ZONE_STATUS || order.status === RESPONDED_STATUS;
              const isPending  = order.status === PENDING_PAYMENT_STATUS;
              const isPaid     = order.paymentStatus === 'paid';
              return React.createElement('tr', {
                key: order.id,
                className: order.status === OUT_OF_ZONE_STATUS ? 'row-out-of-zone' : order.status === RESPONDED_STATUS ? 'row-responded' : ''
              },
                React.createElement('td', null, order.folio),
                React.createElement('td', null, order.customerName),
                React.createElement('td', null,
                  isSpecial
                    ? React.createElement('span', {
                        className: order.status === OUT_OF_ZONE_STATUS ? 'status-badge status-badge-out-of-zone' : 'status-badge status-badge-responded'
                      }, order.status)
                    : isPending
                    ? React.createElement('span', { className: 'payment-pending-badge' }, '⏳ Pendiente de pago')
                    : React.createElement('span', null,
                        order.status,
                        isPaid ? React.createElement('span', { className: 'payment-badge', style: { marginLeft: '0.4rem' } }, '💳 Pago confirmado') : null
                      )
                ),
                React.createElement('td', null, order.deliveryDate || 'Sin asignar'),
                React.createElement('td', null,
                  React.createElement('button', { onClick: () => setSelectedOrderId(order.id) }, 'Ver detalles'),
                  !isSpecial && !isPending && order.status === 'Recibido' ? React.createElement('button', { onClick: () => confirmOrder(order) }, 'Confirmar') : null,
                  !isSpecial && !isPending
                    ? React.createElement('select', { value: order.status, onChange: (event) => changeStatus(order, event.target.value) },
                        STATUS_FLOW.filter(s => s !== PENDING_PAYMENT_STATUS).map((status) => React.createElement('option', { key: status, value: status }, status))
                      )
                    : null
                )
              );
            })
          )
        )
      )
    ),
    selectedOrder ? React.createElement(
      'section',
      { className: 'card' },
      React.createElement('h2', null, `Detalles de ${selectedOrder.folio}`),
      React.createElement('ul', null,
        React.createElement('li', null, `Nombre: ${selectedOrder.customerName}`),
        React.createElement('li', null, `WhatsApp: ${selectedOrder.whatsapp || 'No registrado'}`),
        React.createElement('li', null, `Correo: ${selectedOrder.email || 'No registrado'}`),
        React.createElement('li', null, `Zona de entrega: ${selectedOrder.zone || 'No registrada'}`),
        React.createElement('li', null, `Dirección: ${selectedOrder.address || 'No registrada'}`),
        React.createElement('li', null, `Producto(s): ${selectedOrder.requestedItems?.map((entry) => `${entry.name} x${entry.quantity}`).join(', ') || selectedOrder.item?.name || 'Sin producto'}`),
        React.createElement('li', null, `Costo estimado: ${formatCurrency(selectedOrder.estimatedCost || 0)}`),
        React.createElement('li', null, `Cantidad: ${selectedOrder.quantity || 1}`),
        React.createElement('li', null, `Fecha de entrega solicitada: ${selectedOrder.deliveryDate || 'Sin asignar'}`),
        React.createElement('li', null, `Notas: ${selectedOrder.notes || 'Sin comentarios'}`),
        selectedOrder.paymentStatus === 'paid'
          ? React.createElement('li', null,
              React.createElement('span', { className: 'payment-badge' }, '💳 Pago confirmado'),
              ` — ${formatCurrency(selectedOrder.paymentAmount || 0)}`
            )
          : selectedOrder.status === PENDING_PAYMENT_STATUS
          ? React.createElement('li', null, React.createElement('span', { className: 'payment-pending-badge' }, '⏳ Esperando pago del cliente'))
          : null,
        selectedOrder.paymentRef
          ? React.createElement('li', null, `Ref. PayPal: ${selectedOrder.paymentRef}`)
          : null,
        selectedOrder.notifiedAt
          ? React.createElement('li', null, `📤 Notificación enviada: ${selectedOrder.notifiedAt.replace('T', ' a las ')}`)
          : null,
        selectedOrder.respondedAt
          ? React.createElement('li', null, `✅ Cliente respondió: ${selectedOrder.respondedAt.replace('T', ' a las ')}`)
          : null
      ),

      // Panel de notificación para pedidos fuera de cobertura
      selectedOrder.status === OUT_OF_ZONE_STATUS
        ? React.createElement('div', { className: 'out-of-zone-panel' },
            React.createElement('h3', null, '⚠️ Código postal fuera de cobertura'),
            React.createElement('p', { className: 'hint', style: { margin: '0 0 0.75rem' } },
              `Zona registrada: ${selectedOrder.zone || 'No especificada'}`
            ),
            selectedOrder.notifiedAt
              ? React.createElement('div', null,
                  React.createElement('div', { className: 'notify-sent-info' },
                    `📤 Notificación enviada el ${selectedOrder.notifiedAt.replace('T', ' a las ')}`,
                    React.createElement('br', null),
                    !selectedOrder.respondedAt
                      ? React.createElement('span', null, '⏳ Esperando respuesta del cliente')
                      : null
                  ),
                  React.createElement('div', { className: 'row', style: { gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.75rem' } },
                    React.createElement('button', {
                      disabled: notifying || !selectedOrder.email,
                      style: { background: '#6366f1' },
                      onClick: () => handleNotifyZone(selectedOrder, 'email')
                    }, notifying ? 'Enviando…' : '✉️ Enviar correo'),
                    !selectedOrder.respondedAt
                      ? React.createElement('button', {
                          onClick: () => handleClientResponded(selectedOrder)
                        }, '✅ Cliente respondió')
                      : null,
                    React.createElement('button', {
                      className: 'danger',
                      onClick: () => handleCancelFromZonePanel(selectedOrder)
                    }, '✖ Cancelar pedido')
                  )
                )
              : React.createElement('div', { className: 'row', style: { gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.5rem' } },
                  (selectedOrder.whatsapp || selectedOrder.phone)
                    ? React.createElement('button', {
                        className: 'primary',
                        disabled: notifying,
                        onClick: () => handleNotifyZone(selectedOrder, 'whatsapp')
                      }, notifying ? 'Abriendo…' : '💬 Notificar por WhatsApp')
                    : null,
                  React.createElement('button', {
                    disabled: notifying || !selectedOrder.email,
                    style: { background: '#6366f1' },
                    onClick: () => handleNotifyZone(selectedOrder, 'email')
                  }, notifying ? 'Enviando…' : '✉️ Notificar por correo')
                )
          )
        : null,

      // Panel para pedidos que ya respondieron — capturar nueva dirección o cancelar
      selectedOrder.status === RESPONDED_STATUS
        ? React.createElement('div', { className: 'responded-panel' },
            React.createElement('h3', null, '✅ Cliente respondió'),
            selectedOrder.respondedAt
              ? React.createElement('p', { className: 'hint', style: { margin: '0 0 0.75rem' } },
                  `Respuesta registrada: ${selectedOrder.respondedAt.replace('T', ' a las ')}`
                )
              : null,
            React.createElement('p', { style: { margin: '0 0 0.5rem', fontWeight: 600, color: '#065f46' } },
              'Ingresa el CP y la dirección de entrega que proporcionó el cliente:'
            ),
            React.createElement('input', {
              placeholder: 'Código Postal (5 dígitos)',
              value: newZipInput,
              maxLength: 5,
              onChange: (e) => setNewZipInput(e.target.value.replace(/\D/g, '')),
              style: { marginBottom: '0.45rem' }
            }),
            (() => {
              if (!newZipInput || newZipInput.length < 5) return null;
              const match = ZIP_ZONE_MAP[newZipInput];
              return React.createElement('p', {
                style: { margin: '0 0 0.5rem', fontSize: '0.85rem',
                  color: match ? '#065f46' : '#92400e' }
              }, match ? `✅ Zona detectada: ${match.zone}` : '⚠️ CP no encontrado en zonas de cobertura — se guardará el CP directamente');
            })(),
            React.createElement('input', {
              placeholder: 'Ej. Av. Revolución 123, Col. Polanco, CDMX',
              value: newAddressInput,
              onChange: (e) => setNewAddressInput(e.target.value),
              style: { marginBottom: '0.6rem' }
            }),
            React.createElement('div', { className: 'row', style: { gap: '0.6rem', flexWrap: 'wrap' } },
              React.createElement('button', {
                className: 'primary',
                disabled: !newAddressInput.trim() || newZipInput.length < 5,
                onClick: () => handleConfirmNewAddress(selectedOrder)
              }, 'Confirmar nueva dirección → Mover a "Recibido"'),
              React.createElement('button', {
                className: 'danger',
                onClick: () => handleCancelFromZonePanel(selectedOrder)
              }, '✖ Cancelar pedido')
            )
          )
        : null,

      // Panel IA — generar mensaje personalizado para el cliente
      React.createElement('div', { className: 'ai-message-panel' },
        React.createElement('h3', null, '✨ Generar mensaje con IA'),
        React.createElement('div', { className: 'row', style: { gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' } },
          React.createElement('select', {
            value: msgType,
            style: { flex: 1, minWidth: '200px' },
            onChange: (e) => { setMsgType(e.target.value); setGeneratedMsg(''); }
          },
            React.createElement('option', { value: 'confirmacion' }, '✅ Confirmación de pedido'),
            React.createElement('option', { value: 'recordatorio' }, '📅 Recordatorio de entrega'),
            React.createElement('option', { value: 'listo' },        '📦 Pedido listo para entrega'),
            React.createElement('option', { value: 'retraso' },      '⏳ Aviso de retraso'),
            React.createElement('option', { value: 'pago' },         '💳 Solicitud de anticipo'),
            React.createElement('option', { value: 'gracias' },      '🌸 Agradecimiento post-entrega'),
            React.createElement('option', { value: 'personalizado' },'✏️ Mensaje personalizado')
          ),
          React.createElement('button', {
            className: 'primary',
            disabled: generatingMsg || (msgType === 'personalizado' && !extraNote.trim()),
            onClick: () => handleGenerateMessage(selectedOrder)
          }, generatingMsg ? '✨ Generando…' : 'Generar')
        ),
        msgType === 'personalizado'
          ? React.createElement('textarea', {
              placeholder: 'Describe qué quieres comunicarle al cliente…',
              value: extraNote,
              rows: 2,
              onChange: (e) => setExtraNote(e.target.value),
              style: { marginTop: '0.6rem', width: '100%', resize: 'vertical' }
            })
          : null,
        generatedMsg
          ? React.createElement('div', { style: { marginTop: '0.75rem' } },
              React.createElement('textarea', {
                value: generatedMsg,
                rows: 6,
                onChange: (e) => setGeneratedMsg(e.target.value),
                style: { width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7, fontSize: '0.95rem' }
              }),
              React.createElement('div', { className: 'row', style: { gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' } },
                React.createElement('button', {
                  onClick: () => navigator.clipboard.writeText(generatedMsg)
                    .then(() => setAdminMessage('Mensaje copiado al portapapeles.'))
                }, '📋 Copiar'),
                (selectedOrder.whatsapp || selectedOrder.phone)
                  ? React.createElement('button', {
                      className: 'primary',
                      onClick: () => {
                        const cleaned = (selectedOrder.whatsapp || selectedOrder.phone || '').replace(/\D/g, '');
                        const full = cleaned.startsWith('52') ? cleaned : `52${cleaned}`;
                        window.open(`https://wa.me/${full}?text=${encodeURIComponent(generatedMsg)}`, '_blank');
                      }
                    }, '💬 Abrir en WhatsApp')
                  : null,
                selectedOrder.email
                  ? React.createElement('button', {
                      style: { background: '#6366f1' },
                      onClick: () => handleSendMessage(selectedOrder)
                    }, '✉️ Enviar por correo')
                  : null
              )
            )
          : null
      )

    ) : null,
    React.createElement(
      'section',
      { className: 'card full-width' },
      React.createElement('div', { className: 'cal-header' },
        React.createElement('button', { onClick: prevMonth }, '‹'),
        React.createElement('h2', { style: { margin: 0, flex: 1 } }, monthLabel),
        React.createElement('button', { onClick: () => setCalMonth(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; }) }, 'Hoy'),
        React.createElement('button', { onClick: nextMonth }, '›')
      ),
      React.createElement('div', { className: 'month-grid' },
        /* Loop: genera los 7 encabezados de columna del calendario (Lun–Dom) */
        ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) =>
          React.createElement('div', { key: d, className: 'month-col-header' }, d)
        ),
        /* Loop: recorre todas las celdas del mes y genera un cuadrito por día; cada cuadrito puede mostrar pedidos encima */
        monthCells.map((cell) =>
          React.createElement('div', {
            key: cell.dateStr,
            className: 'month-cell' + (cell.inMonth ? '' : ' out-of-month') + (cell.isToday ? ' today' : '')
          },
            React.createElement('span', { className: 'month-day-num' }, cell.dayNum),
            cell.deliveries.map((order) =>
              React.createElement('div', { key: order.id, className: 'month-order-chip',
                title: `${order.customerName} — ${order.status}` },
                React.createElement('strong', null, order.customerName),
                React.createElement('span', null, order.requestedItems?.map((e) => `${e.name} x${e.quantity}`).join(', ') || order.item?.name || 'Pedido')
              )
            )
          )
        )
      )
    ),
    React.createElement(
      'section',
      { className: 'card' },
      React.createElement('h2', null, 'Ingredientes necesarios (pedidos activos)'),
      React.createElement('p', { className: 'hint', style: { margin: '0 0 0.75rem' } },
        'Los ingredientes se calculan según la fecha de entrega de cada pedido — no la fecha en que se hizo el pedido.'
      ),
      React.createElement('div', { className: 'row', style: { gap: '0.75rem', flexWrap: 'wrap' } },
        React.createElement('button', { onClick: () => {
          const now = new Date();
          // Inicio de semana = lunes de la semana actual
          const dow = now.getDay();
          const diffToMon = dow === 0 ? -6 : 1 - dow;
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() + diffToMon);
          weekStart.setHours(0, 0, 0, 0);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          weekEnd.setHours(23, 59, 59, 999);
          // Filtrar por fecha de entrega dentro de la semana actual
          const ordersThisWeek = allOrders.filter((o) => {
            if (!o.deliveryDate) return false;
            const d = new Date(o.deliveryDate.slice(0, 10) + 'T00:00:00');
            return d >= weekStart && d <= weekEnd && o.status !== 'Cancelado' && o.status !== 'Entregado';
          });
          const agg = buildFromOrders(ordersThisWeek);
          const label = weekStart.toISOString().slice(0, 10);
          exportShoppingPDF(agg, `lista_compra_semana_${label}.pdf`);
        }, className: 'primary' }, 'Exportar lista (esta semana)'),

        React.createElement('button', { onClick: () => {
          const now = new Date();
          const month = now.getMonth();
          const year = now.getFullYear();
          // Filtrar por fecha de entrega dentro del mes actual
          const ordersThisMonth = allOrders.filter((o) => {
            if (!o.deliveryDate) return false;
            const d = new Date(o.deliveryDate.slice(0, 10) + 'T00:00:00');
            return d.getMonth() === month && d.getFullYear() === year && o.status !== 'Cancelado' && o.status !== 'Entregado';
          });
          const agg = buildFromOrders(ordersThisMonth);
          exportShoppingPDF(agg, `lista_compra_${year}-${String(month + 1).padStart(2, '0')}.pdf`);
        } }, 'Exportar lista (este mes)')
      )
    ),
    React.createElement(
      'section',
      { className: 'card' },
      React.createElement('h2', null, 'Base de clientes'),
      React.createElement('ul', null, customerHistory.map((entry) => React.createElement('li', { key: entry.customerName }, `${entry.customerName} — ${entry.orders} pedidos · Último estado: ${entry.lastStatus}`)))
    ),
    ) : null
  );
}

function AdminPasswordGate({ onUnlock }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (res.ok) {
        sessionStorage.setItem('gerbera-admin-token', data.token);
        sessionStorage.setItem('gerbera-admin-path', data.adminPath || '/gerbera-admin-2025');
        onUnlock();
      } else {
        setError(data.error || 'Contraseña incorrecta.');
      }
    } catch {
      setError('Error de conexión. Verifica que el servidor esté activo.');
    } finally {
      setLoading(false);
    }
  };

  return React.createElement('div', { className: 'card center' },
    React.createElement('h2', null, 'Acceso administrador'),
    React.createElement('p', null, 'Ingresa la contraseña para entrar al panel.'),
    React.createElement('form', { onSubmit: handleSubmit, className: 'stack' },
      React.createElement('input', { type: 'password', placeholder: 'Contraseña', value: password, onChange: (event) => setPassword(event.target.value) }),
      React.createElement('button', { type: 'submit', disabled: loading }, loading ? 'Verificando…' : 'Entrar')
    ),
    error ? React.createElement('p', { className: 'hint' }, error) : null,
    React.createElement('a', { href: '/', style: { display: 'block', marginTop: '1rem', color: '#7b4b63', fontSize: '0.9rem', textDecoration: 'none' } }, '← Ir al sitio')
  );
}

// La ruta del admin la devuelve el servidor al hacer login — no se hardcodea aquí
const ADMIN_SECRET_PATH = sessionStorage.getItem('gerbera-admin-path') || '/gerbera-admin-2025';

function ContactPage({ onNavigate }) {
  const EMPTY = { name: '', phone: '', email: '', folio: '', message: '' };
  const [form, setForm] = React.useState(EMPTY);
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) { setSent(true); setForm(EMPTY); }
      else { const d = await res.json(); setError(d.error || 'No se pudo enviar el mensaje. Intenta de nuevo.'); }
    } catch { setError('Error de conexión. Verifica tu internet e intenta de nuevo.'); }
    finally { setSending(false); }
  };

  return React.createElement('div', { className: 'app-shell' },
    React.createElement('div', { className: 'portal-topbar' },
      React.createElement('button', { className: 'portal-back-btn', onClick: () => onNavigate('/') }, '← Inicio')
    ),
    React.createElement('div', { className: 'contact-page card' },
      React.createElement('h2', null, 'Contáctanos'),
      React.createElement('p', { className: 'hint' }, 'Escríbenos y te respondemos lo antes posible por WhatsApp o correo.'),
      sent
        ? React.createElement('div', { className: 'confirmed-banner' },
            React.createElement('div', { className: 'payment-confirmed-badge' }, '✅ ¡Mensaje enviado!'),
            React.createElement('h3', null, '¡Gracias por escribirnos!'),
            React.createElement('p', null, 'Te contactaremos pronto por WhatsApp o correo.'),
            React.createElement('div', { className: 'row', style: { justifyContent: 'center', gap: '0.75rem' } },
              React.createElement('button', { onClick: () => setSent(false) }, 'Enviar otro mensaje'),
              React.createElement('button', { className: 'primary', onClick: () => onNavigate('/') }, 'Ir al inicio')
            )
          )
        : React.createElement('form', { onSubmit: handleSubmit, className: 'stack contact-form' },
            React.createElement('label', null, 'Nombre completo'),
            React.createElement('input', { required: true, placeholder: 'Tu nombre', value: form.name, onChange: e => setForm({ ...form, name: e.target.value }) }),
            React.createElement('label', null, 'Teléfono / WhatsApp'),
            React.createElement('input', { required: true, placeholder: 'Ej. 55 1234 5678', value: form.phone, onChange: e => setForm({ ...form, phone: e.target.value }) }),
            React.createElement('label', null, 'Correo electrónico'),
            React.createElement('input', { required: true, type: 'email', placeholder: 'tu@correo.com', value: form.email, onChange: e => setForm({ ...form, email: e.target.value }) }),
            React.createElement('label', null, 'Folio de pedido (opcional)'),
            React.createElement('input', { placeholder: 'Ej. GB-1001 — si tu mensaje está relacionado a un pedido', value: form.folio, onChange: e => setForm({ ...form, folio: e.target.value }) }),
            React.createElement('label', null, 'Mensaje'),
            React.createElement('textarea', { required: true, rows: 5, placeholder: '¿En qué podemos ayudarte?', value: form.message, onChange: e => setForm({ ...form, message: e.target.value }) }),
            error ? React.createElement('p', { style: { color: '#b33f58', fontSize: '0.9rem', margin: 0 } }, `⚠️ ${error}`) : null,
            React.createElement('button', { type: 'submit', className: 'primary', disabled: sending }, sending ? 'Enviando…' : 'Enviar mensaje')
          )
    )
  );
}

function LandingPage({ catalog, siteConfig, onNavigate }) {
  // Hook que recuerda el folio buscado, el pedido encontrado y el mensaje de resultado.
  const { folioInput, setFolioInput, trackedOrder, trackMessage, handleSearch, handleCancel } = useFolioTracker();

  return React.createElement('div', { className: 'landing' },
    React.createElement('header', { className: 'landing-hero' },
      React.createElement('div', { className: 'hero-brand' },
        React.createElement('img', { src: './src/assets/logo.png', alt: 'Gerbera Bakery', className: 'hero-brand-logo' }),
        React.createElement('div', { className: 'hero-brand-text' },
          React.createElement('span', { className: 'hero-brand-name' }, 'Gerbera Bakery'),
          React.createElement('span', { className: 'hero-brand-slogan' }, siteConfig.landing_slogan || 'Horneando momentos que unen')
        )
      ),
      React.createElement('div', { className: 'hero-actions' },
        React.createElement('div', { className: 'hero-social-icons' },
          React.createElement('a', {
            href: 'https://www.instagram.com/gerberabakeryy',
            target: '_blank', rel: 'noopener noreferrer',
            className: 'hero-social-link', 'aria-label': 'Instagram'
          }, React.createElement('svg', { viewBox: '0 0 24 24', fill: 'currentColor', width: '28', height: '28' },
            React.createElement('path', { d: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z' })
          )),
          React.createElement('span', {
            className: 'hero-social-link', style: { opacity: 0.45, cursor: 'default' }, 'aria-label': 'Facebook'
          }, React.createElement('svg', { viewBox: '0 0 24 24', fill: 'currentColor', width: '28', height: '28' },
            React.createElement('path', { d: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' })
          ))
        ),
        React.createElement('button', { className: 'hero-contact-btn', onClick: () => onNavigate('/contacto') }, 'Contáctanos →')
      )
    ),

    React.createElement('div', { className: 'landing-band landing-welcome-band' },
      React.createElement('p', null, siteConfig.landing_welcome || 'Repostería artesanal hecha desde casa, con ingredientes de calidad y mucho amor. Hacemos entregas en Naucalpan, Atizapán y CDMX.')
    ),

    React.createElement('div', { className: 'landing-band' },
      React.createElement('h2', { className: 'landing-section-title' }, 'Nuestros productos'),
      React.createElement('div', { className: 'landing-cta-wrap' },
        React.createElement('button', { className: 'landing-cta-btn', onClick: () => onNavigate('/pedido') }, 'Hacer un pedido'),
        React.createElement('button', {
          className: 'landing-cta-btn landing-cta-secondary',
          onClick: () => document.getElementById('rastrear').scrollIntoView({ behavior: 'smooth' })
        }, 'Rastrear mi pedido')
      ),
      React.createElement('div', { className: 'landing-product-grid' },
        catalog.length > 0
          /* Loop: recorre el catálogo de productos y genera una tarjeta visual por cada pastel en la landing page */
          ? catalog.map((p) => React.createElement('article', { key: p.id, className: 'landing-product-card' },
              p.image ? React.createElement('img', { src: p.image, alt: p.name, className: 'landing-product-img' }) : null,
              React.createElement('div', { className: 'landing-product-body' },
                React.createElement('h3', null, p.name),
                React.createElement('p', null, p.description),
                React.createElement('strong', { className: 'landing-product-price' }, formatCurrency(p.fullPrice))
              ),
              React.createElement('div', { className: 'landing-product-actions' },
                React.createElement('button', {
                  className: 'landing-product-btn landing-product-btn-detail',
                  onClick: () => onNavigate('/producto/' + p.id)
                }, 'Ver detalles'),
                React.createElement('button', {
                  className: 'landing-product-btn landing-product-btn-buy',
                  onClick: () => onNavigate('/pedido?producto=' + p.id)
                }, 'Comprar')
              )
            ))
          : React.createElement('p', { className: 'hint', style: { textAlign: 'center', gridColumn: '1 / -1' } }, 'Cargando productos…')
      )
    ),

    React.createElement('div', { id: 'rastrear', className: 'landing-band landing-track-band' },
      React.createElement('h2', { className: 'landing-section-title' }, 'Rastrear mi pedido'),
      React.createElement('p', { className: 'landing-section-subtitle' }, 'Ingresa el folio que recibiste al hacer tu pedido.'),
      React.createElement('div', { className: 'landing-track-row' },
        React.createElement('input', {
          placeholder: 'Ej. GB-1001',
          value: folioInput,
          onChange: (e) => setFolioInput(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') handleSearch(); }
        }),
        React.createElement('button', { className: 'landing-track-btn', onClick: handleSearch }, 'Buscar')
      ),
      trackMessage ? React.createElement('p', { style: { color: '#b33f58', marginTop: '0.5rem', fontSize: '0.95rem' } }, trackMessage) : null,
      trackedOrder ? React.createElement('div', { className: 'panel', style: { marginTop: '1rem' } },
        React.createElement('h3', { style: { margin: '0 0 0.5rem' } }, `Pedido ${trackedOrder.folio}`),
        React.createElement('p', { style: { margin: '0.25rem 0' } }, `Estado: ${trackedOrder.status}`),
        React.createElement('p', { style: { margin: '0.25rem 0' } }, `Entrega: ${trackedOrder.deliveryDate || 'Por confirmar'}`),
        React.createElement('div', { className: 'timeline' },
          STATUS_FLOW.map((step) => React.createElement('span', {
            key: step,
            className: getStatusIndex(trackedOrder.status) >= getStatusIndex(step) ? 'chip active' : 'chip'
          }, step))
        ),
        trackedOrder.status !== 'Cancelado' && trackedOrder.status !== 'Entregado'
          ? React.createElement('button', { onClick: handleCancel, className: 'danger', style: { marginTop: '0.75rem' } }, 'Cancelar pedido')
          : React.createElement('p', { className: 'hint' }, 'Este pedido ya no puede modificarse.')
      ) : null
    ),

    React.createElement('footer', { className: 'landing-footer' },
      React.createElement('img', { src: './src/assets/logo.png', alt: 'Gerbera Bakery', className: 'landing-footer-logo' }),
      React.createElement('div', { className: 'landing-footer-text' },
        React.createElement('p', null,
          React.createElement('a', {
            href: 'https://www.instagram.com/gerberabakeryy',
            target: '_blank', rel: 'noopener noreferrer',
            style: { color: '#f2dce5', textDecoration: 'none', fontWeight: 600 }
          }, '📷 @gerberabakeryy')
        ),
        React.createElement('p', null, 'Entregas en Naucalpan · Atizapán · CDMX')
      )
    )
  );
}

function ProductDetailPage({ product, onNavigate }) {
  const [activeImg, setActiveImg] = useState(0);
  const allImages = (product.images && product.images.length > 0)
    ? product.images
    : (product.image ? [product.image] : []);
  const highlights = (product.highlights && product.highlights.length > 0)
    ? product.highlights
    : (PRODUCT_HIGHLIGHTS[product.id] || []);

  return React.createElement('div', { className: 'app-shell' },
    React.createElement('div', { className: 'portal-topbar' },
      React.createElement('button', { className: 'portal-back-btn', onClick: () => onNavigate('/') }, '← Inicio')
    ),
    React.createElement('div', { className: 'product-detail-layout' },
      React.createElement('div', { className: 'product-gallery' },
        allImages.length > 0
          ? React.createElement('img', {
              src: allImages[activeImg],
              alt: product.name,
              className: 'product-gallery-main'
            })
          : React.createElement('div', { className: 'product-gallery-empty' }, 'Fotos próximamente'),
        allImages.length > 1
          ? React.createElement('div', { className: 'product-gallery-thumbs' },
              allImages.map((img, i) => React.createElement('button', {
                key: i,
                className: 'product-gallery-thumb' + (i === activeImg ? ' active' : ''),
                onClick: () => setActiveImg(i)
              }, React.createElement('img', { src: img, alt: `Foto ${i + 1}` })))
            )
          : null,
        React.createElement('div', { className: 'product-gallery-dots' },
          Array.from({ length: 4 }).map((_, i) => React.createElement('span', {
            key: i,
            className: 'product-gallery-dot' + (i < allImages.length ? ' has-photo' : '') + (i === activeImg ? ' active' : '')
          }))
        )
      ),
      React.createElement('div', { className: 'product-detail-info' },
        React.createElement('h1', { className: 'product-detail-name' }, product.name),
        React.createElement('p', { className: 'product-detail-desc' }, product.description),
        highlights.length > 0
          ? React.createElement('div', { className: 'product-ingredients-section' },
              React.createElement('h3', { className: 'product-ingredients-title' }, 'Por qué te va a encantar'),
              React.createElement('div', { className: 'ingredient-chips' },
                highlights.map((h, i) => React.createElement('span', { key: i, className: 'ingredient-chip' }, h))
              )
            )
          : null,
        React.createElement('div', { className: 'product-detail-prices' },
          React.createElement('div', { className: 'product-price-tag product-price-main' },
            React.createElement('span', null, 'Precio del pastel completo'),
            React.createElement('strong', null, formatCurrency(product.fullPrice))
          )
        ),
        React.createElement('button', {
          className: 'landing-cta-btn product-detail-cta',
          onClick: () => onNavigate('/pedido?producto=' + product.id)
        }, 'Pedir ahora')
      )
    )
  );
}

function App() {
  const [orders, setOrders] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [route, setRoute] = useState(getCurrentPath());
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [newOrderAlert, setNewOrderAlert] = useState(false);
  const knownOrderIdsRef = useRef(null);
  const [siteConfig, setSiteConfig] = useState({
    landing_slogan: 'Horneando momentos que unen',
    landing_welcome: 'Repostería artesanal hecha desde casa, con ingredientes de calidad y mucho amor. Hacemos entregas en Naucalpan, Atizapán y CDMX.',
    order_form_title: 'Hacer un pedido',
    order_form_instructions: 'Selecciona tu producto y llena tus datos de contacto.',
    order_confirm_message: 'Te contactaremos por WhatsApp para confirmar los detalles.',
  });

  const loadCatalog = async () => {
    try {
      const res = await fetch('/api/catalog');
      if (res.ok) setCatalog(await res.json());
    } catch (e) {
      console.error('Error cargando catálogo', e);
    }
  };

  const loadSiteConfig = async () => {
    try {
      const res = await fetch('/api/site-config');
      if (res.ok) {
        const data = await res.json();
        if (Object.keys(data).length) setSiteConfig(prev => ({ ...prev, ...data }));
      }
    } catch (e) {
      console.error('Error cargando config', e);
    }
  };

  const saveSiteConfig = async (config) => {
    await adminFetch('/api/site-config', {
      method: 'PUT',
      body: JSON.stringify(config)
    });
    setSiteConfig(prev => ({ ...prev, ...config }));
  };

  const loadOrders = async () => {
    try {
      const res = await adminFetch('/api/orders');
      if (res.ok) {
        const fetched = await res.json();
        if (knownOrderIdsRef.current !== null) {
          const hasNew = fetched.some(o => !knownOrderIdsRef.current.has(o.id));
          if (hasNew) setNewOrderAlert(true);
        }
        knownOrderIdsRef.current = new Set(fetched.map(o => o.id));
        setOrders(fetched);
      }
    } catch (e) {
      console.error('Error cargando pedidos', e);
    }
  };

  useEffect(() => {
    loadCatalog();
    loadSiteConfig();
    sessionStorage.removeItem('gerbera-admin-token');
  }, []);

  useEffect(() => {
    if (adminAuthenticated) loadOrders();
  }, [adminAuthenticated]);

  useEffect(() => {
    const handleRouteChange = () => setRoute(getCurrentPath());
    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  useEffect(() => {
    if (!adminAuthenticated) return;
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, [adminAuthenticated]);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setRoute(window.location.pathname);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('gerbera-admin-token');
    sessionStorage.removeItem('gerbera-admin-path');
    setAdminAuthenticated(false);
    setOrders([]);
    window.location.href = '/';
  };

  if (route === ADMIN_SECRET_PATH) {
    return React.createElement('div', { className: 'app-shell' },
      adminAuthenticated
        ? React.createElement(AdminView, { orders, catalog, siteConfig, onRefresh: loadOrders, onSaveConfig: saveSiteConfig, onLogout: handleLogout, onRefreshCatalog: loadCatalog, newOrderAlert, onClearNewOrderAlert: () => setNewOrderAlert(false) })
        : React.createElement(AdminPasswordGate, { onUnlock: () => setAdminAuthenticated(true) })
    );
  }

  if (route === '/pedido') {
    return React.createElement('div', { className: 'app-shell' },
      React.createElement(CustomerPortal, { catalog, siteConfig, onNavigate: navigate })
    );
  }

  if (route === '/contacto') {
    return React.createElement(ContactPage, { onNavigate: navigate });
  }

  if (route.startsWith('/producto/')) {
    const productId = route.replace('/producto/', '');
    if (!catalog.length) {
      return React.createElement('div', { className: 'app-shell' },
        React.createElement('div', { className: 'portal-topbar' },
          React.createElement('button', { className: 'portal-back-btn', onClick: () => navigate('/') }, '← Inicio')
        ),
        React.createElement('p', { className: 'hint', style: { textAlign: 'center', marginTop: '2rem' } }, 'Cargando…')
      );
    }
    const product = catalog.find(p => p.id === productId);
    if (product) return React.createElement(ProductDetailPage, { product, onNavigate: navigate });
    navigate('/');
    return null;
  }

  return React.createElement(LandingPage, { catalog, siteConfig, onNavigate: navigate });
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));

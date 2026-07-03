export async function sendOrderNotification(order) {
  const apiKey = window?.__RESEND_API_KEY__ || '';
  const fromEmail = window?.__RESEND_FROM_EMAIL__ || 'onboarding@resend.dev';
  const adminEmail = window?.__ADMIN_EMAIL__ || 'gerberabakeryy@gmail.com';

  if (!apiKey) {
    console.warn('Resend API key missing. Order notification skipped.');
    return { ok: false, reason: 'missing_api_key' };
  }

  const payload = {
    from: `Gerbera Bakery <${fromEmail}>`,
    to: [adminEmail],
    subject: `Nuevo pedido ${order.folio}`,
    html: `
      <h2>Nuevo pedido recibido</h2>
      <p><strong>Folio:</strong> ${order.folio}</p>
      <p><strong>Cliente:</strong> ${order.customerName}</p>
      <p><strong>Correo:</strong> ${order.email || 'No proporcionado'}</p>
      <p><strong>WhatsApp:</strong> ${order.whatsapp || 'No proporcionado'}</p>
      <p><strong>Productos:</strong> ${order.requestedItems?.map((item) => `${item.name} x${item.quantity}`).join(', ') || 'Sin datos'}</p>
      <p><strong>Fecha de entrega:</strong> ${order.deliveryDate || 'Sin asignar'}</p>
      <p><strong>Notas:</strong> ${order.notes || 'Sin comentarios'}</p>
    `
  };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    return await response.json();
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

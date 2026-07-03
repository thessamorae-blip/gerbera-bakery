// Funciones para manejar la autenticación del admin en las llamadas al servidor.
// El token del admin se guarda en sessionStorage al iniciar sesión y se envía
// en el encabezado "Authorization" de cada petición protegida.

// Obtiene el token JWT del admin guardado en el navegador.
export function getAdminToken() {
  return sessionStorage.getItem('gerbera-admin-token') || '';
}

// Devuelve los encabezados necesarios para llamadas autenticadas.
// Incluye el tipo de contenido (JSON) y el token del admin.
export function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getAdminToken()}`
  };
}

// Hace una petición al servidor con el token del admin en los encabezados.
// Es igual a fetch() normal, pero agrega la autenticación automáticamente.
// Recibe la URL y las opciones del fetch; devuelve la respuesta del servidor.
export function adminFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAdminToken()}`,
      ...(options.headers || {})
    }
  });
}

import { formatCurrency } from './utils/formatCurrency.js';
import { computeFullPrice } from './utils/computeFullPrice.js';
import { useToast } from './hooks/useToast.js';

export function ContentEditor({ catalog: initialCatalog, siteConfig: initialConfig, onSaveCatalog, onSaveConfig }) {
  const [tab, setTab] = React.useState('landing');
  const [config, setConfig] = React.useState({ ...initialConfig });
  const [catalog, setCatalog] = React.useState(initialCatalog || []);
  const [selectedId, setSelectedId] = React.useState(initialCatalog?.[0]?.id || '');
  const [editProduct, setEditProduct] = React.useState(null);
  const [newHighlight, setNewHighlight] = React.useState('');
  // Hook para notificaciones temporales ("Guardado ✓") que desaparecen solos.
  const [toast, showToast] = useToast(2200);

  React.useEffect(() => {
    setCatalog(initialCatalog || []);
  }, [initialCatalog]);

  React.useEffect(() => {
    setConfig({ ...initialConfig });
  }, [initialConfig]);

  React.useEffect(() => {
    if (!catalog.length) return;
    const current = catalog.find(p => p.id === selectedId) || catalog[0];
    if (!current) return;
    setSelectedId(current.id);
    setEditProduct({ ...current, images: current.images || [], highlights: current.highlights || [] });
  }, [catalog]);

  const readFile = (file, cb) => {
    const reader = new FileReader();
    reader.onload = () => cb(reader.result);
    reader.readAsDataURL(file);
  };

  const selectProduct = (id) => {
    setSelectedId(id);
    const p = catalog.find(item => item.id === id);
    if (p) setEditProduct({ ...p, images: p.images || [], highlights: p.highlights || [] });
  };

  const updateField = (field, value) => {
    setEditProduct(prev => {
      if (!prev) return prev;
      if (field === 'price') return { ...prev, price: value, fullPrice: computeFullPrice(prev.id, value) };
      return { ...prev, [field]: value };
    });
  };

  const addPhoto = (dataUrl) => {
    setEditProduct(prev => {
      if (!prev || prev.images.length >= 4) return prev;
      return { ...prev, images: [...prev.images, dataUrl] };
    });
  };

  const removePhoto = (index) => {
    setEditProduct(prev => {
      if (!prev) return prev;
      return { ...prev, images: prev.images.filter((_, i) => i !== index) };
    });
  };

  const addHighlight = () => {
    const text = newHighlight.trim();
    if (!text || !editProduct || editProduct.highlights.length >= 6) return;
    setEditProduct(prev => ({ ...prev, highlights: [...prev.highlights, text] }));
    setNewHighlight('');
  };

  const removeHighlight = (index) => {
    setEditProduct(prev => ({ ...prev, highlights: prev.highlights.filter((_, i) => i !== index) }));
  };

  const saveProduct = async () => {
    if (!editProduct) return;
    const next = catalog.map(p => p.id === selectedId ? { ...p, ...editProduct } : p);
    setCatalog(next);
    await onSaveCatalog(next);
    showToast('Producto guardado');
  };

  const saveConfig = async () => {
    await onSaveConfig(config);
    showToast('Cambios guardados');
  };

  const tabBtn = (id, label) => React.createElement('button', {
    key: id,
    className: 'tab-btn' + (tab === id ? ' active' : ''),
    onClick: () => setTab(id)
  }, label);

  // ── Landing page tab ──────────────────────────────────────────────────────────
  const landingTab = React.createElement('div', { className: 'content-tab-body stack' },
    React.createElement('label', null, 'Slogan'),
    React.createElement('input', {
      value: config.landing_slogan || '',
      placeholder: 'Horneando momentos que unen',
      onChange: e => setConfig(prev => ({ ...prev, landing_slogan: e.target.value }))
    }),
    React.createElement('label', null, 'Texto de bienvenida'),
    React.createElement('textarea', {
      rows: 4,
      value: config.landing_welcome || '',
      placeholder: 'Descripción de la bakery para la página principal…',
      onChange: e => setConfig(prev => ({ ...prev, landing_welcome: e.target.value }))
    }),
    React.createElement('button', { className: 'primary content-save-btn', onClick: saveConfig }, 'Guardar cambios')
  );

  // ── Productos tab ─────────────────────────────────────────────────────────────
  const productosTab = editProduct
    ? React.createElement('div', { className: 'content-tab-body' },
        React.createElement('div', { className: 'content-product-layout' },

          React.createElement('div', { className: 'content-product-col stack' },
            React.createElement('label', null, 'Producto'),
            React.createElement('select', { value: selectedId, onChange: e => selectProduct(e.target.value) },
              catalog.map(p => React.createElement('option', { key: p.id, value: p.id }, p.name))
            ),

            React.createElement('label', null, 'Nombre'),
            React.createElement('input', {
              value: editProduct.name || '',
              onChange: e => updateField('name', e.target.value)
            }),

            React.createElement('label', null, 'Descripción'),
            React.createElement('textarea', {
              rows: 3,
              value: editProduct.description || '',
              onChange: e => updateField('description', e.target.value)
            }),

            React.createElement('label', null, 'Precio por porción'),
            React.createElement('input', {
              type: 'number', min: 0, value: editProduct.price || '',
              onChange: e => updateField('price', e.target.value)
            }),
            React.createElement('p', { className: 'hint', style: { margin: 0 } },
              `Precio completo calculado: ${formatCurrency(editProduct.fullPrice)}`
            )
          ),

          React.createElement('div', { className: 'content-product-col stack' },
            React.createElement('p', { className: 'address-section-title', style: { margin: '0 0 0.6rem' } }, 'Fotos del producto (máx. 4)'),
            React.createElement('div', { className: 'content-photo-grid' },
              [0, 1, 2, 3].map(i => {
                const img = editProduct.images[i];
                return img
                  ? React.createElement('div', { key: i, className: 'content-photo-slot content-photo-filled' },
                      React.createElement('img', { src: img, alt: `Foto ${i + 1}`, className: 'content-photo-preview' }),
                      React.createElement('button', {
                        className: 'content-photo-remove',
                        onClick: () => removePhoto(i)
                      }, '✕')
                    )
                  : React.createElement('label', { key: i, className: 'content-photo-slot content-photo-empty' },
                      React.createElement('span', null, '+ Agregar foto'),
                      React.createElement('input', {
                        type: 'file', accept: 'image/*', style: { display: 'none' },
                        onChange: e => {
                          const f = e.target.files?.[0];
                          if (f) readFile(f, addPhoto);
                        }
                      })
                    );
              })
            ),

            React.createElement('p', { className: 'address-section-title', style: { margin: '0.75rem 0 0.5rem' } }, 'Por qué te va a encantar (máx. 6)'),
            React.createElement('div', { className: 'ingredient-chips', style: { marginBottom: '0.5rem', minHeight: '32px' } },
              editProduct.highlights.map((h, i) => React.createElement('span', { key: i, className: 'ingredient-chip content-highlight-chip' },
                h,
                React.createElement('button', { className: 'content-chip-x', onClick: () => removeHighlight(i) }, '×')
              ))
            ),
            editProduct.highlights.length < 6
              ? React.createElement('div', { className: 'row' },
                  React.createElement('input', {
                    placeholder: 'Ej. Húmedo y esponjoso',
                    value: newHighlight,
                    onChange: e => setNewHighlight(e.target.value),
                    onKeyDown: e => { if (e.key === 'Enter') addHighlight(); }
                  }),
                  React.createElement('button', { onClick: addHighlight }, 'Agregar')
                )
              : React.createElement('p', { className: 'hint', style: { margin: 0 } }, 'Máximo 6 badges alcanzado'),

            React.createElement('div', { className: 'row', style: { marginTop: '1rem' } },
              React.createElement('button', { className: 'primary', onClick: saveProduct }, 'Guardar producto'),
              React.createElement('a', {
                href: '/producto/' + selectedId,
                target: '_blank',
                rel: 'noopener noreferrer',
                className: 'content-preview-link'
              }, 'Ver vista previa ↗')
            )
          )
        )
      )
    : React.createElement('p', { className: 'hint' }, 'Sin productos en el catálogo.');

  // ── Página de pedido tab ──────────────────────────────────────────────────────
  const pedidoTab = React.createElement('div', { className: 'content-tab-body stack' },
    React.createElement('label', null, 'Título del formulario'),
    React.createElement('input', {
      value: config.order_form_title || '',
      placeholder: 'Hacer un pedido',
      onChange: e => setConfig(prev => ({ ...prev, order_form_title: e.target.value }))
    }),
    React.createElement('label', null, 'Instrucciones para el cliente'),
    React.createElement('textarea', {
      rows: 3,
      value: config.order_form_instructions || '',
      placeholder: 'Selecciona un producto y llena tus datos de contacto.',
      onChange: e => setConfig(prev => ({ ...prev, order_form_instructions: e.target.value }))
    }),
    React.createElement('label', null, 'Mensaje de confirmación (lo ve el cliente al completar el pedido)'),
    React.createElement('textarea', {
      rows: 3,
      value: config.order_confirm_message || '',
      placeholder: 'Te contactaremos por WhatsApp para confirmar los detalles.',
      onChange: e => setConfig(prev => ({ ...prev, order_confirm_message: e.target.value }))
    }),
    React.createElement('button', { className: 'primary content-save-btn', onClick: saveConfig }, 'Guardar cambios')
  );

  return React.createElement('section', { className: 'card full-width' },
    React.createElement('h2', null, 'Gestión de contenido'),
    React.createElement('div', { className: 'tab-row' },
      tabBtn('landing', 'Landing page'),
      tabBtn('productos', 'Productos'),
      tabBtn('pedido', 'Página de pedido')
    ),
    tab === 'landing' ? landingTab : null,
    tab === 'productos' ? productosTab : null,
    tab === 'pedido' ? pedidoTab : null,
    React.createElement('div', { className: 'toast' + (toast ? ' show' : '') }, toast)
  );
}

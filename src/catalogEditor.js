import { formatCurrency } from './utils/formatCurrency.js';
import { computeFullPrice } from './utils/computeFullPrice.js';
import { useToast } from './hooks/useToast.js';

export function CatalogEditor({ catalog: initialCatalog, onSaveCatalog }) {
  const [catalog, setCatalog] = React.useState(initialCatalog || []);
  const [selectedId, setSelectedId] = React.useState(initialCatalog?.[0]?.id || '');
  const [editProduct, setEditProduct] = React.useState(null);
  const [newProduct, setNewProduct] = React.useState({ id: '', name: '', description: '', price: '', estimatedCost: '', fullPrice: '', recipeId: '' });
  const [showAddModal, setShowAddModal] = React.useState(false);

  React.useEffect(() => {
    setCatalog(initialCatalog || []);
  }, [initialCatalog]);

  React.useEffect(() => {
    if (!catalog.length) {
      setSelectedId('');
      setEditProduct(null);
      return;
    }
    const current = catalog.find((product) => product.id === selectedId) || catalog[0];
    setSelectedId(current.id);
    setEditProduct({ ...current });
  }, [catalog]);

  const saveCatalog = async (nextCatalog) => {
    const mapped = nextCatalog.map((product) => ({
      ...product,
      price: Number(product.price) || 0,
      estimatedCost: Number(product.estimatedCost) || 0,
      fullPrice: Number(product.fullPrice) || 0
    }));
    await onSaveCatalog(mapped);
  };

  // Hook para notificaciones temporales ("Guardado ✓") que desaparecen solos.
  const [toast, showToast] = useToast(1800);

  const readFileAsDataUrl = (file, cb) => {
    const reader = new FileReader();
    reader.onload = () => cb(reader.result);
    reader.readAsDataURL(file);
  };

  const selectProduct = (id) => {
    setSelectedId(id);
    const product = catalog.find((item) => item.id === id);
    setEditProduct(product ? { ...product } : null);
  };

  const updateEditField = (field, value) => {
    setEditProduct((prev) => {
      if (!prev) return prev;
      if (field === 'price') {
        const fp = computeFullPrice(prev.id, value);
        return { ...prev, [field]: value, fullPrice: fp };
      }
      if (field === 'id') {
        const fp = computeFullPrice(value, prev.price);
        return { ...prev, [field]: value, fullPrice: fp };
      }
      return { ...prev, [field]: value };
    });
  };

  const saveSelectedProduct = async () => {
    if (!editProduct || !editProduct.id) return;
    const next = catalog.map((product) =>
      product.id === selectedId
        ? { ...product, ...editProduct, price: Number(editProduct.price) || 0, estimatedCost: Number(editProduct.estimatedCost) || 0 }
        : product
    );
    setCatalog(next);
    await saveCatalog(next);
    setSelectedId(editProduct.id);
    showToast('Cambios guardados');
  };

  const deleteSelectedProduct = async () => {
    if (!selectedId) return;
    const confirmed = window.confirm('¿Eliminar este producto del catálogo?');
    if (!confirmed) return;
    const next = catalog.filter((product) => product.id !== selectedId);
    setCatalog(next);
    await saveCatalog(next);
    if (next.length) {
      selectProduct(next[0].id);
    } else {
      setSelectedId('');
      setEditProduct(null);
    }
    showToast('Producto eliminado');
  };

  const addProduct = async () => {
    if (!newProduct.id || !newProduct.name) return;
    const fp = computeFullPrice(newProduct.id, newProduct.price);
    const next = [
      ...catalog,
      {
        id: newProduct.id,
        name: newProduct.name,
        description: newProduct.description,
        price: Number(newProduct.price) || 0,
        estimatedCost: Number(newProduct.estimatedCost) || 0,
        fullPrice: fp || Number(newProduct.fullPrice) || 0,
        recipeId: newProduct.recipeId,
        image: newProduct.image || ''
      }
    ];
    setCatalog(next);
    await saveCatalog(next);
    setNewProduct({ id: '', name: '', description: '', price: '', estimatedCost: '', fullPrice: '', recipeId: '' });
    selectProduct(newProduct.id);
    setShowAddModal(false);
    showToast('Producto agregado');
  };

  return React.createElement('section', { className: 'card catalog-editor-card' },
    React.createElement('div', { className: 'catalog-header' },
      React.createElement('h2', null, 'Catálogo de productos'),
      React.createElement('button', { className: 'primary catalog-add-button', onClick: () => setShowAddModal(true) }, 'Agregar producto nuevo')
    ),
    React.createElement('div', { className: 'catalog-main' },
      React.createElement('div', { className: 'catalog-left' },
        React.createElement('div', { className: 'catalog-card-block' },
          React.createElement('div', { className: 'catalog-select-row' },
            React.createElement('label', null, 'Selecciona producto'),
            React.createElement('select', { value: selectedId, onChange: (event) => selectProduct(event.target.value) },
              catalog.map((product) => React.createElement('option', { key: product.id, value: product.id }, product.name))
            )
          ),
          editProduct ? React.createElement('article', { className: 'catalog-card' },
            React.createElement('div', { className: 'catalog-card-content' },
              React.createElement('div', { className: 'catalog-card-column' },
                editProduct.image ? React.createElement('img', { src: editProduct.image, alt: editProduct.name, style: { width: '100%', borderRadius: '10px', marginBottom: '8px', objectFit: 'cover', height: '110px' } }) : null,
                React.createElement('label', null, 'Imagen (cambiar)'),
                React.createElement('input', {
                  type: 'file',
                  accept: 'image/*',
                  onChange: (e) => {
                    const f = e.target.files && e.target.files[0];
                    if (!f) return;
                    readFileAsDataUrl(f, (dataUrl) => updateEditField('image', dataUrl));
                  }
                }),
                React.createElement('label', null, 'ID del producto'),
                React.createElement('input', { value: editProduct.id, onChange: (event) => updateEditField('id', event.target.value) }),
                React.createElement('label', null, 'Nombre del producto'),
                React.createElement('input', { value: editProduct.name, onChange: (event) => updateEditField('name', event.target.value) }),
                React.createElement('label', null, 'Descripción'),
                React.createElement('textarea', { rows: 3, value: editProduct.description, onChange: (event) => updateEditField('description', event.target.value) })
              ),
              React.createElement('div', { className: 'catalog-card-column' },
                React.createElement('label', null, 'Precio por porción'),
                React.createElement('input', { type: 'number', min: 0, className: 'wide-input', value: editProduct.price, onChange: (event) => updateEditField('price', event.target.value) }),
                React.createElement('label', null, 'Precio completo'),
                React.createElement('input', { type: 'number', min: 0, className: 'wide-input', value: editProduct.fullPrice || '', onChange: (event) => updateEditField('fullPrice', event.target.value) }),
                React.createElement('label', null, 'Costo estimado'),
                React.createElement('input', { type: 'number', min: 0, className: 'wide-input', value: editProduct.estimatedCost, onChange: (event) => updateEditField('estimatedCost', event.target.value) }),
                React.createElement('label', null, 'Recipe ID (opcional)'),
                React.createElement('input', { value: editProduct.recipeId || '', onChange: (event) => updateEditField('recipeId', event.target.value) })
              )
            ),
            React.createElement('div', { className: 'catalog-card-actions' },
              React.createElement('button', { className: 'primary', onClick: saveSelectedProduct }, 'Guardar cambios'),
              React.createElement('button', { className: 'danger', onClick: deleteSelectedProduct }, 'Eliminar')
            )
          ) : React.createElement('p', null, 'No hay productos en el catálogo.')
        )
      ),
      React.createElement('div', { className: 'catalog-right' },
        React.createElement('div', { className: 'catalog-preview-grid' },
          catalog.map((product) => React.createElement('article', { key: product.id, className: 'catalog-preview-card' },
            React.createElement('img', { src: product.image, alt: product.name, className: 'catalog-preview-image' }),
            React.createElement('h3', null, product.name),
            React.createElement('p', null, product.description),
            React.createElement('div', null,
              React.createElement('small', null, 'Porción: '), React.createElement('strong', null, formatCurrency(product.price)),
              React.createElement('span', { style: { marginLeft: '0.8rem' } }, React.createElement('small', null, 'Completo: '), React.createElement('strong', null, formatCurrency(product.fullPrice)))
            )
          ))
        )
      )
    ),
    showAddModal ? React.createElement('div', { className: 'modal-overlay' },
      React.createElement('div', { className: 'modal' },
        React.createElement('h3', null, 'Agregar producto'),
        React.createElement('div', { className: 'catalog-card-content' },
          React.createElement('div', { className: 'catalog-card-column' },
            newProduct.image ? React.createElement('img', { src: newProduct.image, alt: 'preview', style: { width: '100%', borderRadius: '10px', marginBottom: '8px', objectFit: 'cover', height: '110px' } }) : null,
            React.createElement('label', null, 'Imagen del producto'),
            React.createElement('input', { type: 'file', accept: 'image/*', onChange: (e) => {
              const f = e.target.files && e.target.files[0];
              if (!f) return;
              readFileAsDataUrl(f, (dataUrl) => setNewProduct((prev) => ({ ...prev, image: dataUrl })));
            } }),
            React.createElement('label', null, 'ID del producto'),
            React.createElement('input', { value: newProduct.id, onChange: (e) => setNewProduct({ ...newProduct, id: e.target.value }) }),
            React.createElement('label', null, 'Nombre del producto'),
            React.createElement('input', { value: newProduct.name, onChange: (e) => setNewProduct({ ...newProduct, name: e.target.value }) }),
            React.createElement('label', null, 'Descripción'),
            React.createElement('textarea', { rows: 3, value: newProduct.description, onChange: (e) => setNewProduct({ ...newProduct, description: e.target.value }) })
          ),
          React.createElement('div', { className: 'catalog-card-column' },
            React.createElement('label', null, 'Precio por porción'),
            React.createElement('input', { type: 'number', min: 0, className: 'wide-input', value: newProduct.price, onChange: (e) => setNewProduct({ ...newProduct, price: e.target.value }) }),
            React.createElement('label', null, 'Precio completo'),
            React.createElement('input', { type: 'number', min: 0, className: 'wide-input', value: newProduct.fullPrice, onChange: (e) => setNewProduct({ ...newProduct, fullPrice: e.target.value }) }),
            React.createElement('label', null, 'Costo estimado'),
            React.createElement('input', { type: 'number', min: 0, className: 'wide-input', value: newProduct.estimatedCost, onChange: (e) => setNewProduct({ ...newProduct, estimatedCost: e.target.value }) }),
            React.createElement('label', null, 'Recipe ID (opcional)'),
            React.createElement('input', { value: newProduct.recipeId, onChange: (e) => setNewProduct({ ...newProduct, recipeId: e.target.value }) })
          )
        ),
        React.createElement('div', { style: { display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '0.8rem' } },
          React.createElement('button', { className: 'primary', onClick: addProduct }, 'Agregar'),
          React.createElement('button', { onClick: () => setShowAddModal(false) }, 'Cancelar')
        )
      )
    ) : null,
    React.createElement('div', { className: 'toast' + (toast ? ' show' : '') }, toast)
  );
}

import { adminFetch, authHeaders } from './utils/authHelpers.js';
import { useToast } from './hooks/useToast.js';

const { useState, useEffect, useRef } = React;

const MONTHS_ES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

const CONTENT_TYPES = ['Foto de producto','Reel corto (15s)','Historia de Instagram','Detrás de cámaras','Post especial / fecha','Anuncio de disponibilidad','Testimonio de cliente'];
const TONES        = ['Cálido y cercano','Festivo y celebratorio','Informativo y claro','Nostálgico y emotivo','Antojo irresistible'];
const PRODUCTS     = ['General / Temporada','Pastel de zanahoria','Pastel de naranja con cajeta','Pastel de plátano con chispas de chocolate','Pastel de chocolate con frutos rojos','Cheesecake de guayaba','Brownie de caramelo'];

const STATUS_COLORS = {
  'Borrador':            '#9ca3af',
  'Listo para publicar': '#d66aa7',
  'Publicado':           '#2d7a4f',
};

const CHANNEL_COLORS = {
  instagram: '#e1306c',
  facebook:  '#1877f2',
  ambos:     '#9333ea',
};

const CHANNEL_LABELS = { instagram: 'IG', facebook: 'FB', ambos: 'IG+FB' };

export function SocialContent() {
  const [view,         setView]         = useState('calendar');
  const [posts,        setPosts]        = useState([]);
  const [calYear,      setCalYear]      = useState(() => new Date().getFullYear());
  const [calMonth,     setCalMonth]     = useState(() => new Date().getMonth());
  const [generating,   setGenerating]   = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [generated,    setGenerated]    = useState(null);
  const [editCaption,  setEditCaption]  = useState('');
  const [editHashtags, setEditHashtags] = useState('');
  const [editingPost,  setEditingPost]  = useState(null);
  const [error,        setError]        = useState('');
  const [showGuide,    setShowGuide]    = useState(false);
  const [confirmDel,   setConfirmDel]   = useState(null);
  // Hook para notificaciones temporales ("Post guardado ✓") que desaparecen solos.
  const [toast, showToast] = useToast(2500);

  const [form, setForm] = useState({
    product:       'General / Temporada',
    contentType:   'Foto de producto',
    tone:          'Cálido y cercano',
    scheduledDate: '',
    scheduledTime: '',
    channel:       'ambos',
    notes:         '',
  });

  useEffect(() => { loadPosts(); }, []);

  async function loadPosts() {
    try {
      const res = await adminFetch('/api/social-posts');
      if (res.ok) setPosts(await res.json());
    } catch (e) { console.error(e); }
  }

  async function generateContent(formData) {
    setGenerating(true);
    setError('');
    setGenerated(null);
    try {
      const res  = await adminFetch('/api/ai/generate-post', { method: 'POST', body: JSON.stringify(formData) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error al generar.'); return; }
      setGenerated(data);
      setEditCaption(data.caption  || '');
      setEditHashtags(data.hashtags || '');
    } catch (e) {
      setError('Error de conexión. Verifica que el servidor esté activo.');
    } finally {
      setGenerating(false);
    }
  }

  async function savePost() {
    if (!generated && !editingPost) return;
    setSaving(true);
    const payload = {
      ...form,
      caption:    editCaption,
      hashtags:   editHashtags,
      imageIdea:  generated?.image_idea || editingPost?.imageIdea || '',
      bestTime:   generated?.best_time  || editingPost?.bestTime  || '',
      status:     'Borrador',
    };
    try {
      let res;
      if (editingPost) {
        res = await adminFetch(`/api/social-posts/${editingPost.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        res = await adminFetch('/api/social-posts', { method: 'POST', body: JSON.stringify(payload) });
      }
      if (res.ok) {
        showToast('Post guardado en el calendario ✓');
        await loadPosts();
        setView('calendar');
        resetForm();
      } else {
        const d = await res.json();
        setError(d.error || 'Error al guardar.');
      }
    } catch (e) {
      setError('Error de conexión.');
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(post, status) {
    const res = await adminFetch(`/api/social-posts/${post.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    if (res.ok) { await loadPosts(); showToast(`Estado actualizado: ${status}`); }
  }

  async function deletePost(post) {
    const res = await adminFetch(`/api/social-posts/${post.id}`, { method: 'DELETE' });
    if (res.ok) { await loadPosts(); showToast('Post eliminado.'); setConfirmDel(null); }
  }

  function resetForm() {
    setForm({ product: 'General / Temporada', contentType: 'Foto de producto', tone: 'Cálido y cercano', scheduledDate: '', scheduledTime: '', channel: 'ambos', notes: '' });
    setGenerated(null);
    setEditCaption('');
    setEditHashtags('');
    setError('');
    setEditingPost(null);
  }

  function openCreate(prefillDate) {
    resetForm();
    if (prefillDate) setForm(f => ({ ...f, scheduledDate: prefillDate }));
    setView('create');
  }

  function openEdit(post) {
    setEditingPost(post);
    setForm({
      product:       post.product       || 'General / Temporada',
      contentType:   post.contentType   || 'Foto de producto',
      tone:          post.tone          || 'Cálido y cercano',
      scheduledDate: post.scheduledDate || '',
      scheduledTime: post.scheduledTime || '',
      channel:       post.channel       || 'ambos',
      notes:         post.notes         || '',
    });
    setEditCaption(post.caption   || '');
    setEditHashtags(post.hashtags || '');
    setGenerated({ caption: post.caption, hashtags: post.hashtags, best_time: post.bestTime, image_idea: post.imageIdea });
    setView('create');
  }

  function copyText(text, label) {
    navigator.clipboard.writeText(text).then(() => showToast(`${label} copiado ✓`)).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(`${label} copiado ✓`);
    });
  }

  // ── Calendar helpers ────────────────────────────────────────────────────────

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }

  // Pre-agrupamos posts por fecha para que el grid no haga filter×N_celdas
  const postsByDate = (() => {
    const map = new Map();
    for (const p of posts) {
      if (!p.scheduledDate) continue;
      const key = p.scheduledDate.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return map;
  })();

  function calendarCells() {
    const firstDow  = new Date(calYear, calMonth, 1).getDay();
    const daysInMon = new Date(calYear, calMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMon; d++) {
      const mm = String(calMonth + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      cells.push({ day: d, dateStr: `${calYear}-${mm}-${dd}` });
    }
    return cells;
  }

  const monthPosts = posts.filter(p => {
    const mm = String(calMonth + 1).padStart(2, '0');
    return p.scheduledDate && p.scheduledDate.startsWith(`${calYear}-${mm}`);
  }).sort((a, b) => (a.scheduledDate > b.scheduledDate ? 1 : -1));

  // ── Select elements ─────────────────────────────────────────────────────────

  const sel = (id, val, opts, onChange) => React.createElement('select', { id, value: val, onChange: e => onChange(e.target.value), className: 'social-select' },
    opts.map(o => React.createElement('option', { key: o, value: o }, o))
  );

  // ── CALENDAR VIEW ───────────────────────────────────────────────────────────

  if (view === 'calendar') {
    const cells = calendarCells();

    const calGrid = React.createElement('div', { className: 'social-cal-grid' },
      DAYS_SHORT.map(d => React.createElement('div', { key: d, className: 'social-cal-header' }, d)),
      cells.map((cell, i) => {
        if (!cell) return React.createElement('div', { key: `e${i}`, className: 'social-cal-cell empty' });
        const dayPosts = postsByDate.get(cell.dateStr) || [];
        const today    = new Date().toISOString().split('T')[0];
        const isToday  = cell.dateStr === today;
        return React.createElement('div', {
          key: cell.dateStr,
          className: 'social-cal-cell' + (isToday ? ' today' : ''),
          onClick: () => openCreate(cell.dateStr),
        },
          React.createElement('span', { className: 'cal-day-num' }, cell.day),
          React.createElement('div', { className: 'cal-post-dots' },
            dayPosts.slice(0, 3).map((p, pi) =>
              React.createElement('span', {
                key: pi,
                className: 'cal-post-dot',
                style: { background: CHANNEL_COLORS[p.channel] || '#d66aa7' },
                title: `${p.product} · ${p.status}`,
              })
            ),
            dayPosts.length > 3 && React.createElement('span', { className: 'cal-post-more' }, `+${dayPosts.length - 3}`)
          )
        );
      })
    );

    const upcomingList = monthPosts.length
      ? React.createElement('div', { className: 'social-upcoming' },
          React.createElement('h3', { className: 'social-section-title' }, `Posts de ${MONTHS_ES[calMonth]}`),
          monthPosts.map(p => React.createElement('div', { key: p.id, className: 'social-post-row' },
            React.createElement('div', { className: 'social-post-row-left' },
              React.createElement('span', { className: 'social-channel-badge', style: { background: CHANNEL_COLORS[p.channel] } },
                CHANNEL_LABELS[p.channel] || p.channel
              ),
              React.createElement('div', { className: 'social-post-row-info' },
                React.createElement('span', { className: 'social-post-row-product' }, p.product),
                React.createElement('span', { className: 'social-post-row-date' }, p.scheduledDate + (p.scheduledTime ? ' · ' + p.scheduledTime : '')),
                React.createElement('span', { className: 'social-post-row-caption' }, (p.caption || '').slice(0, 80) + ((p.caption || '').length > 80 ? '…' : ''))
              )
            ),
            React.createElement('div', { className: 'social-post-row-actions' },
              React.createElement('span', {
                className: 'social-status-chip',
                style: { background: STATUS_COLORS[p.status] || '#9ca3af' },
              }, p.status),
              React.createElement('button', { className: 'social-row-btn', onClick: e => { e.stopPropagation(); openEdit(p); } }, 'Editar'),
              p.status !== 'Publicado' && React.createElement('button', { className: 'social-row-btn success', onClick: e => { e.stopPropagation(); updateStatus(p, 'Publicado'); } }, 'Publicado'),
              React.createElement('button', { className: 'social-row-btn danger', onClick: e => { e.stopPropagation(); setConfirmDel(p); } }, '✕')
            )
          ))
        )
      : React.createElement('p', { className: 'social-empty-msg' }, `No hay posts agendados para ${MONTHS_ES[calMonth]}. Haz clic en cualquier día del calendario para crear uno.`);

    return React.createElement('div', { className: 'social-content-wrap' },
      // Header
      React.createElement('div', { className: 'social-header' },
        React.createElement('h2', { className: 'social-title' }, 'Contenido para redes'),
        React.createElement('button', { className: 'primary social-create-btn', onClick: () => openCreate('') }, '+ Crear nuevo post')
      ),

      // Calendar nav + grid
      React.createElement('section', { className: 'card full-width' },
        React.createElement('div', { className: 'social-cal-nav' },
          React.createElement('button', { className: 'cal-nav-btn', onClick: prevMonth }, '‹'),
          React.createElement('span', { className: 'social-cal-month' }, `${MONTHS_ES[calMonth]} ${calYear}`),
          React.createElement('button', { className: 'cal-nav-btn', onClick: nextMonth }, '›')
        ),
        calGrid,
        React.createElement('p', { className: 'social-cal-hint' }, 'Haz clic en un día para crear un post con esa fecha.')
      ),

      // Upcoming posts list
      React.createElement('section', { className: 'card full-width' }, upcomingList),

      // Meta Business Suite guide
      React.createElement('section', { className: 'card full-width social-guide-section' },
        React.createElement('div', { className: 'social-guide-header', onClick: () => setShowGuide(g => !g) },
          React.createElement('span', null, '📘 Guía rápida: cómo publicar en Meta Business Suite'),
          React.createElement('span', { className: 'social-guide-toggle' }, showGuide ? '▲' : '▼')
        ),
        showGuide && React.createElement('div', { className: 'social-guide-body' },
          React.createElement('ol', null,
            React.createElement('li', null, React.createElement('strong', null, 'Entra a business.facebook.com'), ' e inicia sesión con la cuenta de Gerbera Bakery.'),
            React.createElement('li', null, 'En el menú izquierdo selecciona ', React.createElement('strong', null, '"Planificador de contenido"'), '.'),
            React.createElement('li', null, 'Haz clic en ', React.createElement('strong', null, '"Crear publicación"'), ' o selecciona una fecha en el calendario.'),
            React.createElement('li', null, 'Elige ', React.createElement('strong', null, 'Instagram, Facebook o ambos'), ' como destino del post.'),
            React.createElement('li', null, 'Pega el ', React.createElement('strong', null, 'caption'), ' generado aquí en el campo de texto.'),
            React.createElement('li', null, 'Pega los ', React.createElement('strong', null, 'hashtags'), ' al final del caption (Instagram) o en el primer comentario.'),
            React.createElement('li', null, 'Sube la foto o video que preparaste según la ', React.createElement('strong', null, 'idea visual'), '.'),
            React.createElement('li', null, 'Configura la ', React.createElement('strong', null, 'fecha y hora'), ' de publicación sugerida.'),
            React.createElement('li', null, 'Haz clic en ', React.createElement('strong', null, '"Programar"'), ' — listo.')
          ),
          React.createElement('p', { className: 'social-guide-tip' }, '💡 Tip: los mejores horarios para Gerbera Bakery son jueves y viernes de 7-9 pm y sábados de 10-11 am.')
        )
      ),

      // Confirm delete modal
      confirmDel && React.createElement('div', { className: 'modal-overlay', onClick: () => setConfirmDel(null) },
        React.createElement('div', { className: 'modal-box', onClick: e => e.stopPropagation() },
          React.createElement('p', null, `¿Eliminar el post de "${confirmDel.product}" del ${confirmDel.scheduledDate}?`),
          React.createElement('div', { className: 'row', style: { justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' } },
            React.createElement('button', { onClick: () => setConfirmDel(null) }, 'Cancelar'),
            React.createElement('button', { className: 'danger-btn', onClick: () => deletePost(confirmDel) }, 'Eliminar')
          )
        )
      ),

      toast && React.createElement('div', { className: 'toast show' }, toast)
    );
  }

  // ── CREATE / EDIT VIEW ──────────────────────────────────────────────────────

  const formPanel = React.createElement('div', { className: 'social-form-panel' },
    React.createElement('h3', { className: 'social-panel-title' }, editingPost ? 'Editar post' : 'Nuevo post'),

    React.createElement('label', { className: 'social-label' }, 'Producto'),
    sel('product', form.product, PRODUCTS, v => setForm(f => ({ ...f, product: v }))),

    React.createElement('label', { className: 'social-label' }, 'Tipo de contenido'),
    sel('contentType', form.contentType, CONTENT_TYPES, v => setForm(f => ({ ...f, contentType: v }))),

    React.createElement('label', { className: 'social-label' }, 'Tono'),
    sel('tone', form.tone, TONES, v => setForm(f => ({ ...f, tone: v }))),

    React.createElement('div', { className: 'social-row-2' },
      React.createElement('div', null,
        React.createElement('label', { className: 'social-label' }, 'Fecha'),
        React.createElement('input', { type: 'date', className: 'social-input', value: form.scheduledDate, onChange: e => setForm(f => ({ ...f, scheduledDate: e.target.value })) })
      ),
      React.createElement('div', null,
        React.createElement('label', { className: 'social-label' }, 'Hora (opcional)'),
        React.createElement('input', { type: 'time', className: 'social-input', value: form.scheduledTime, onChange: e => setForm(f => ({ ...f, scheduledTime: e.target.value })) })
      )
    ),

    React.createElement('label', { className: 'social-label' }, 'Canal'),
    React.createElement('div', { className: 'social-channel-group' },
      [['instagram','Instagram'],['facebook','Facebook'],['ambos','Instagram + Facebook']].map(([val, label]) =>
        React.createElement('label', { key: val, className: 'social-channel-opt' + (form.channel === val ? ' selected' : '') },
          React.createElement('input', { type: 'radio', name: 'channel', value: val, checked: form.channel === val, onChange: () => setForm(f => ({ ...f, channel: val })) }),
          label
        )
      )
    ),

    React.createElement('label', { className: 'social-label' }, 'Notas adicionales (opcional)'),
    React.createElement('textarea', {
      className: 'social-textarea',
      rows: 3,
      placeholder: 'Ej. Mencionar que quedan pocas piezas, promover para el fin de semana...',
      value: form.notes,
      onChange: e => setForm(f => ({ ...f, notes: e.target.value }))
    }),

    error && React.createElement('div', { className: 'social-error' }, error),

    React.createElement('button', {
      className: 'primary social-generate-btn',
      onClick: () => generateContent(form),
      disabled: generating,
    }, generating ? '✨ Generando...' : '✨ Generar con IA')
  );

  const resultPanel = generated
    ? React.createElement('div', { className: 'social-result-panel' },
        React.createElement('h3', { className: 'social-panel-title' }, 'Contenido generado'),

        React.createElement('label', { className: 'social-label' }, 'Caption'),
        React.createElement('textarea', {
          className: 'social-textarea social-caption-ta',
          rows: 6,
          value: editCaption,
          onChange: e => setEditCaption(e.target.value),
        }),
        React.createElement('button', { className: 'social-copy-btn', onClick: () => copyText(editCaption, 'Caption') }, '📋 Copiar caption'),

        React.createElement('label', { className: 'social-label', style: { marginTop: '1rem' } }, 'Hashtags'),
        React.createElement('textarea', {
          className: 'social-textarea',
          rows: 4,
          value: editHashtags,
          onChange: e => setEditHashtags(e.target.value),
        }),
        React.createElement('button', { className: 'social-copy-btn', onClick: () => copyText(editHashtags, 'Hashtags') }, '📋 Copiar hashtags'),

        generated.best_time && React.createElement('div', { className: 'social-meta-row' },
          React.createElement('span', { className: 'social-meta-label' }, '⏰ Mejor hora:'),
          React.createElement('span', null, generated.best_time)
        ),

        generated.image_idea && React.createElement('div', { className: 'social-meta-row' },
          React.createElement('span', { className: 'social-meta-label' }, '📸 Idea visual:'),
          React.createElement('span', null, generated.image_idea)
        ),

        React.createElement('div', { className: 'social-action-row' },
          React.createElement('button', { onClick: () => generateContent(form), disabled: generating },
            generating ? 'Generando...' : '🔄 Regenerar'
          ),
          React.createElement('button', {
            className: 'primary',
            onClick: savePost,
            disabled: saving,
          }, saving ? 'Guardando...' : '📅 Guardar en calendario')
        )
      )
    : React.createElement('div', { className: 'social-result-empty' },
        React.createElement('div', { className: 'social-result-placeholder' },
          React.createElement('p', null, '✨'),
          React.createElement('p', null, 'Completa el formulario y haz clic en'),
          React.createElement('p', null, React.createElement('strong', null, '"Generar con IA"')),
          React.createElement('p', null, 'para que Claude redacte el caption, hashtags e ideas visuales para tu post.')
        )
      );

  // Instagram preview
  const preview = generated && React.createElement('div', { className: 'social-preview-wrap' },
    React.createElement('h3', { className: 'social-panel-title' }, 'Vista previa Instagram'),
    React.createElement('div', { className: 'ig-preview' },
      React.createElement('div', { className: 'ig-header' },
        React.createElement('div', { className: 'ig-avatar' }, '🌸'),
        React.createElement('div', { className: 'ig-profile-info' },
          React.createElement('span', { className: 'ig-username' }, 'gerberabakeryy'),
          React.createElement('span', { className: 'ig-location' }, 'Naucalpan, México')
        ),
        React.createElement('span', { className: 'ig-dots' }, '···')
      ),
      React.createElement('div', { className: 'ig-image-placeholder' },
        React.createElement('div', { className: 'ig-image-inner' },
          React.createElement('span', { className: 'ig-image-icon' }, '🧁'),
          generated.image_idea && React.createElement('p', { className: 'ig-image-hint' }, generated.image_idea)
        )
      ),
      React.createElement('div', { className: 'ig-actions' },
        React.createElement('span', null, '♡'),
        React.createElement('span', null, '🗨'),
        React.createElement('span', null, '↗'),
      ),
      React.createElement('div', { className: 'ig-caption-area' },
        React.createElement('span', { className: 'ig-cap-user' }, 'gerberabakeryy '),
        React.createElement('span', { className: 'ig-cap-text' }, editCaption || generated.caption || ''),
        editHashtags && React.createElement('p', { className: 'ig-hashtags' }, editHashtags)
      )
    )
  );

  return React.createElement('div', { className: 'social-content-wrap' },
    // Back + title
    React.createElement('div', { className: 'social-header' },
      React.createElement('button', { className: 'social-back-btn', onClick: () => { resetForm(); setView('calendar'); } }, '← Volver al calendario'),
      React.createElement('h2', { className: 'social-title' }, editingPost ? 'Editar post' : 'Crear nuevo post')
    ),

    // Form + result grid
    React.createElement('div', { className: 'social-create-grid' },
      formPanel,
      resultPanel
    ),

    // Instagram preview (full width below)
    preview && React.createElement('section', { className: 'card full-width' }, preview),

    toast && React.createElement('div', { className: 'toast show' }, toast)
  );
}

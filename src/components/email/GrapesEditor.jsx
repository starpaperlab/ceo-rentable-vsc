import React, {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import grapesjs from 'grapesjs';
import newsletterPlugin from 'grapesjs-preset-newsletter';
import 'grapesjs/dist/css/grapes.min.css';
import { EDITOR_UI_ES, GJS_I18N_ES, STYLE_SECTORS_ES, VARIABLES_EMAIL_ES } from './grapesTranslationsEs';

const EDITOR_LAYOUT_CSS = `
  .gjs-editor-cont .gjs-pn-panels {
    display: none !important;
  }
  .gjs-editor-cont .gjs-cv-canvas {
    top: 0 !important;
    width: 100% !important;
    border: 0 !important;
  }
  .gjs-editor-cont .gjs-sm-sectors {
    padding: 0;
    background: transparent;
  }
  .gjs-editor-cont .gjs-sm-sector {
    border: 1px solid #eee3d8;
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 10px;
    background: #fff;
  }
  .gjs-editor-cont .gjs-sm-title {
    background: #fff8fb;
    border-bottom: 1px solid #f1e5ee;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.02em;
  }
  .gjs-editor-cont .gjs-sm-properties {
    padding: 8px 10px 10px;
  }
  .gjs-editor-cont .gjs-sm-property {
    margin-bottom: 8px;
  }
  .gjs-editor-cont .gjs-field {
    border-radius: 8px;
    border-color: #e9ded4;
  }
  .gjs-editor-cont .gjs-sm-label {
    font-size: 12px;
    font-weight: 600;
    color: #4b4a4d;
  }
  .gjs-editor-cont .gjs-trt-trait {
    border-bottom: 1px solid #f0e8df;
  }
  .gjs-editor-cont .gjs-trt-trait__label {
    font-size: 12px;
    color: #4b4a4d;
  }
  .gjs-editor-cont .gjs-trt-trait .gjs-field {
    border-radius: 8px;
    border-color: #e9ded4;
  }
  .gjs-editor-cont .gjs-block-category {
    border: 1px solid #eee3d8;
    border-radius: 10px;
    margin-bottom: 8px;
    overflow: hidden;
    background: #fff;
  }
  .gjs-editor-cont .gjs-title {
    background: #fff8fb;
    border-bottom: 1px solid #f1e5ee;
    font-size: 12px;
    font-weight: 700;
  }
`;

function isLikelyButton(component) {
  if (!component) return false;
  const type = `${component.get('type') || ''}`.toLowerCase();
  const tag = `${component.get('tagName') || ''}`.toLowerCase();
  const classes = (component.getClasses?.() || []).map((c) => `${c}`.toLowerCase());

  return (
    type.includes('button') ||
    tag === 'button' ||
    tag === 'a' ||
    classes.some((cls) => cls.includes('button') || cls.includes('btn'))
  );
}

function componentLabel(component) {
  if (!component) return EDITOR_UI_ES.none;
  const type = `${component.get('type') || ''}`.toLowerCase();
  const tag = `${component.get('tagName') || ''}`.toLowerCase();

  if (isLikelyButton(component)) return EDITOR_UI_ES.labelButton;
  if (type.includes('text') || ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5'].includes(tag)) return EDITOR_UI_ES.labelText;
  if (tag === 'img' || type.includes('image')) return EDITOR_UI_ES.labelImage;
  if (type.includes('row')) return EDITOR_UI_ES.labelRow;
  if (type.includes('cell')) return EDITOR_UI_ES.labelCell;
  return EDITOR_UI_ES.labelBlock;
}

function parsePx(value, fallback) {
  if (value == null || value === '') return fallback;
  const numeric = parseInt(`${value}`.replace('px', ''), 10);
  return Number.isNaN(numeric) ? fallback : numeric;
}

function parsePadding(stylePadding = '') {
  const parts = `${stylePadding}`.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { y: 12, x: 20 };
  if (parts.length === 1) {
    const v = parsePx(parts[0], 12);
    return { y: v, x: v };
  }
  return { y: parsePx(parts[0], 12), x: parsePx(parts[1], 20) };
}

function normalizeColorForInput(value, fallback = '#000000') {
  const raw = `${value || ''}`.trim().toLowerCase();
  if (!raw) return fallback;

  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^#[0-9a-f]{8}$/i.test(raw)) return `#${raw.slice(1, 7)}`;

  const rgbMatch = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => parseInt(part.trim(), 10));
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      const [r, g, b] = parts.slice(0, 3).map((n) => Math.max(0, Math.min(255, n)));
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
  }

  const named = {
    white: '#ffffff',
    black: '#000000',
    red: '#ff0000',
    green: '#008000',
    blue: '#0000ff',
    gray: '#808080',
    grey: '#808080',
    pink: '#ffc0cb',
    transparent: fallback,
  };
  return named[raw] || fallback;
}

function getButtonQuickState(component) {
  const styles = component.getStyle?.() || {};
  const attrs = component.getAttributes?.() || {};
  const padding = parsePadding(styles.padding);

  return {
    text: `${component.get('content') || ''}`.replace(/<[^>]*>/g, '').trim(),
    href: attrs.href || '',
    bgColor: normalizeColorForInput(styles['background-color'], '#d45387'),
    textColor: normalizeColorForInput(styles.color, '#ffffff'),
    width: styles.width || 'auto',
    radius: parsePx(styles['border-radius'], 12),
    paddingY: padding.y,
    paddingX: padding.x,
  };
}

function applyAlignment(editor, alignment, forceButtonMode = false) {
  const selected = editor.getSelected();
  if (!selected) return;
  const parent = selected.parent?.();
  const tag = `${selected.get('tagName') || ''}`.toLowerCase();
  const buttonMode = forceButtonMode || isLikelyButton(selected);
  const isImage = tag === 'img';
  const isText = ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'td'].includes(tag);

  if (buttonMode) {
    // Alineación SOLO del botón seleccionado, sin tocar el contenedor padre.
    // Esto evita mover otros elementos hermanos.
    const nextStyles = {
      float: 'none',
      'text-align': 'initial',
      'max-width': '100%',
    };

    if (alignment === 'center') {
      Object.assign(nextStyles, {
        display: 'table',
        'margin-left': 'auto',
        'margin-right': 'auto',
      });
    }
    if (alignment === 'left') {
      Object.assign(nextStyles, {
        display: 'table',
        'margin-left': '0',
        'margin-right': 'auto',
      });
    }
    if (alignment === 'right') {
      Object.assign(nextStyles, {
        display: 'table',
        'margin-left': 'auto',
        'margin-right': '0',
      });
    }

    selected.addStyle(nextStyles);
    if (parent) {
      const parentStyles = parent.getStyle?.() || {};
      if (parentStyles['text-align']) {
        parent.addStyle({ 'text-align': '' });
      }
    }
    const parentAttrs = parent?.getAttributes?.() || {};
    if (parent && parentAttrs.align) {
      const { align, ...rest } = parentAttrs;
      parent.setAttributes(rest);
    }
    return;
  }

  if (isImage) {
    selected.addStyle({ display: 'block' });
    if (alignment === 'center') selected.addStyle({ 'margin-left': 'auto', 'margin-right': 'auto' });
    if (alignment === 'left') selected.addStyle({ 'margin-left': '0', 'margin-right': 'auto' });
    if (alignment === 'right') selected.addStyle({ 'margin-left': 'auto', 'margin-right': '0' });
    if (parent) {
      parent.addStyle({ 'text-align': alignment });
      parent.addAttributes({ align: alignment });
    }
    return;
  }

  if (isText) {
    selected.addStyle({ 'text-align': alignment });
    return;
  }

  if (alignment === 'center') selected.addStyle({ 'margin-left': 'auto', 'margin-right': 'auto' });
  if (alignment === 'left') selected.addStyle({ 'margin-left': '0', 'margin-right': 'auto' });
  if (alignment === 'right') selected.addStyle({ 'margin-left': 'auto', 'margin-right': '0' });
}

function normalizeButtonWidth(value) {
  const trimmed = `${value || ''}`.trim();
  if (!trimmed) return 'auto';
  if (trimmed === 'auto') return 'auto';
  if (trimmed.endsWith('%') || trimmed.endsWith('px')) return trimmed;
  const asNumber = parseInt(trimmed, 10);
  return Number.isNaN(asNumber) ? 'auto' : `${asNumber}px`;
}

const GrapesEditor = forwardRef(function GrapesEditor({ initialHtml, initialJson, onSave }, ref) {
  const editorRef = useRef(null);
  const buttonQuickRef = useRef({
    text: '',
    href: '',
    bgColor: '#D45387',
    textColor: '#ffffff',
    width: 'auto',
    radius: 12,
    paddingY: 12,
    paddingX: 20,
  });

  const uid = useId().replace(/:/g, '_');
  const editorId = `gjs_${uid}`;
  const stylesId = `${editorId}_styles`;
  const traitsId = `${editorId}_traits`;
  const blocksId = `${editorId}_blocks`;
  const layersId = `${editorId}_layers`;
  const selectorsId = `${editorId}_selectors`;

  const [selectedLabel, setSelectedLabel] = useState(EDITOR_UI_ES.none);
  const [hasSelection, setHasSelection] = useState(false);
  const [buttonSelected, setButtonSelected] = useState(false);
  const [buttonQuick, setButtonQuick] = useState(buttonQuickRef.current);
  const [inspectorTab, setInspectorTab] = useState('styles');

  const handleSave = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const html = editor.runCommand('gjs-get-inlined-html') || editor.getHtml();
    const json = editor.getProjectData();
    onSave({ html, json });
  }, [onSave]);

  useImperativeHandle(ref, () => ({
    save: handleSave,
  }), [handleSave]);

  const syncSelectionState = useCallback((component) => {
    setHasSelection(!!component);
    setSelectedLabel(componentLabel(component));

    const isButton = isLikelyButton(component);
    setButtonSelected(isButton);
    if (isButton && component) {
      const next = getButtonQuickState(component);
      buttonQuickRef.current = next;
      setButtonQuick(next);
    }
  }, []);

  useEffect(() => {
    const editor = grapesjs.init({
      container: `#${editorId}`,
      height: '100%',
      width: 'auto',
      storageManager: false,
      locale: 'es',
      i18n: {
        locale: 'es',
        localeFallback: 'es',
        messages: { es: GJS_I18N_ES },
      },
      panels: { defaults: [] },
      blockManager: {
        appendTo: `#${blocksId}`,
      },
      layerManager: {
        appendTo: `#${layersId}`,
      },
      traitManager: {
        appendTo: `#${traitsId}`,
      },
      selectorManager: {
        appendTo: `#${selectorsId}`,
      },
      plugins: [newsletterPlugin],
      pluginsOpts: {
        [newsletterPlugin]: {
          modalLabelImport: 'Pegar HTML',
          modalLabelExport: 'Ver HTML',
          codeViewerTheme: 'material',
          importPlaceholder: '<table>...</table>',
          updateProjectData: true,
        },
      },
      styleManager: {
        appendTo: `#${stylesId}`,
        sectors: STYLE_SECTORS_ES,
      },
      canvas: {
        styles: ['https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap'],
      },
    });

    editorRef.current = editor;

    if (initialJson) {
      try {
        const parsed = typeof initialJson === 'string' ? JSON.parse(initialJson) : initialJson;
        editor.loadProjectData(parsed);
      } catch (_) {
        editor.setComponents(initialHtml || '');
      }
    } else if (initialHtml) {
      editor.setComponents(initialHtml);
    }

    editor.Commands.add('ceo-align-left', { run: (ed) => applyAlignment(ed, 'left') });
    editor.Commands.add('ceo-align-center', { run: (ed) => applyAlignment(ed, 'center') });
    editor.Commands.add('ceo-align-right', { run: (ed) => applyAlignment(ed, 'right') });
    editor.Commands.add('ceo-center-button', { run: (ed) => applyAlignment(ed, 'center', true) });
    editor.Commands.add('ceo-duplicate', { run: (ed) => ed.runCommand('tlb-clone') });
    editor.Commands.add('ceo-delete', { run: (ed) => ed.runCommand('tlb-delete') });

    const applyComponentToolbar = (component) => {
      if (!component) return;
      const toolbar = [
        { command: 'tlb-move', label: '↕', attributes: { title: EDITOR_UI_ES.tooltipMove } },
        { command: 'ceo-duplicate', label: '⧉', attributes: { title: EDITOR_UI_ES.tooltipDuplicate } },
        { command: 'ceo-delete', label: '✕', attributes: { title: EDITOR_UI_ES.tooltipDelete } },
        { command: 'ceo-align-left', label: '⟸', attributes: { title: EDITOR_UI_ES.tooltipAlignLeft } },
        { command: 'ceo-align-center', label: '◎', attributes: { title: EDITOR_UI_ES.tooltipAlignCenter } },
        { command: 'ceo-align-right', label: '⟹', attributes: { title: EDITOR_UI_ES.tooltipAlignRight } },
      ];

      if (isLikelyButton(component)) {
        toolbar.push({ command: 'ceo-center-button', label: '●', attributes: { title: EDITOR_UI_ES.tooltipCenterButton } });
      }

      component.set('toolbar', toolbar);
    };

    editor.on('component:selected', (component) => {
      applyComponentToolbar(component);
      syncSelectionState(component);
    });
    editor.on('component:deselected', () => {
      syncSelectionState(null);
    });
    editor.on('component:update', () => {
      const current = editor.getSelected();
      if (current && isLikelyButton(current)) {
        const next = getButtonQuickState(current);
        buttonQuickRef.current = next;
        setButtonQuick(next);
      }
    });

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, [blocksId, editorId, initialHtml, initialJson, layersId, selectorsId, stylesId, syncSelectionState, traitsId]);

  const runCommand = (command) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.runCommand(command);
  };

  const insertVariable = (variable) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selected = editor.getSelected();
    if (!selected) {
      window.alert(EDITOR_UI_ES.selectTextHint);
      return;
    }
    const current = selected.get('content') || '';
    selected.set('content', `${current}${variable}`);
  };

  const updateButtonQuick = (field, value) => {
    const editor = editorRef.current;
    const selected = editor?.getSelected();
    if (!editor || !selected || !isLikelyButton(selected)) return;

    const safeValue = (field === 'bgColor' || field === 'textColor')
      ? normalizeColorForInput(value, field === 'bgColor' ? '#d45387' : '#ffffff')
      : value;

    const next = { ...buttonQuickRef.current, [field]: safeValue };
    buttonQuickRef.current = next;
    setButtonQuick(next);

    if (field === 'text') {
      selected.set('content', value || 'Botón');
      return;
    }
    if (field === 'href') {
      const attrs = selected.getAttributes() || {};
      selected.setAttributes({ ...attrs, href: value || '#' });
      return;
    }
    if (field === 'bgColor') {
      selected.addStyle({ 'background-color': safeValue || '#D45387' });
      return;
    }
    if (field === 'textColor') {
      selected.addStyle({ color: safeValue || '#ffffff' });
      return;
    }
    if (field === 'width') {
      selected.addStyle({ width: normalizeButtonWidth(value) });
      return;
    }
    if (field === 'radius') {
      selected.addStyle({ 'border-radius': `${parsePx(value, 12)}px` });
      return;
    }
    if (field === 'paddingY' || field === 'paddingX') {
      selected.addStyle({
        padding: `${parsePx(next.paddingY, 12)}px ${parsePx(next.paddingX, 20)}px`,
      });
    }
  };

  return (
    <div className="h-full min-h-0 bg-[#F8F5F1]">
      <style>{EDITOR_LAYOUT_CSS}</style>

      <div className="h-full min-h-0 grid grid-cols-[minmax(0,1fr)_340px]">
        <section className="relative min-w-0 border-r border-[#eee3d8]">
          {hasSelection && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-white border border-slate-200 shadow-sm rounded-full px-1.5 py-1 flex items-center gap-1">
              <button onClick={() => runCommand('tlb-move')} className="px-1.5 text-[11px] rounded-full hover:bg-slate-100" title={EDITOR_UI_ES.tooltipMove}>↕</button>
              <button onClick={() => runCommand('ceo-duplicate')} className="px-1.5 text-[11px] rounded-full hover:bg-slate-100" title={EDITOR_UI_ES.tooltipDuplicate}>⧉</button>
              <button onClick={() => runCommand('ceo-delete')} className="px-1.5 text-[11px] rounded-full hover:bg-slate-100" title={EDITOR_UI_ES.tooltipDelete}>✕</button>
              <button onClick={() => runCommand('ceo-align-left')} className="px-1.5 text-[11px] rounded-full hover:bg-slate-100" title={EDITOR_UI_ES.tooltipAlignLeft}>⟸</button>
              <button onClick={() => runCommand('ceo-align-center')} className="px-1.5 text-[11px] rounded-full hover:bg-slate-100" title={EDITOR_UI_ES.tooltipAlignCenter}>◎</button>
              <button onClick={() => runCommand('ceo-align-right')} className="px-1.5 text-[11px] rounded-full hover:bg-slate-100" title={EDITOR_UI_ES.tooltipAlignRight}>⟹</button>
            </div>
          )}
          <div id={editorId} className="h-full w-full overflow-hidden" />
        </section>

        <aside className="w-full bg-white flex flex-col min-h-0">
          <div className="p-3 border-b border-[#eee3d8] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">{EDITOR_UI_ES.selected}</span>
              <span className="text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-200 rounded-md px-2 py-1">
                {selectedLabel}
              </span>
            </div>

            <div className="rounded-lg border border-pink-100 bg-pink-50/40 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-pink-700 mb-2">{EDITOR_UI_ES.tabVariables}</p>
              <div className="flex flex-wrap gap-1">
                {VARIABLES_EMAIL_ES.map((variable) => (
                  <button
                    key={variable}
                    onClick={() => insertVariable(variable)}
                    className="text-[10px] font-mono bg-white border border-pink-200 text-pink-700 rounded px-1.5 py-0.5 hover:bg-pink-100"
                    title={`${EDITOR_UI_ES.insertVariableTitle}: ${variable}`}
                  >
                    {variable}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700 mb-2">{EDITOR_UI_ES.tabAlignment}</p>
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => runCommand('ceo-align-left')} className="px-2.5 py-1 text-xs rounded border border-slate-200 hover:bg-slate-50" title={EDITOR_UI_ES.tooltipAlignLeft}>{EDITOR_UI_ES.alignLeft}</button>
                <button onClick={() => runCommand('ceo-align-center')} className="px-2.5 py-1 text-xs rounded border border-slate-200 hover:bg-slate-50" title={EDITOR_UI_ES.tooltipAlignCenter}>{EDITOR_UI_ES.alignCenter}</button>
                <button onClick={() => runCommand('ceo-align-right')} className="px-2.5 py-1 text-xs rounded border border-slate-200 hover:bg-slate-50" title={EDITOR_UI_ES.tooltipAlignRight}>{EDITOR_UI_ES.alignRight}</button>
                <button onClick={() => runCommand('ceo-center-button')} className={`px-2.5 py-1 text-xs rounded border ${buttonSelected ? 'border-pink-300 bg-pink-50 text-pink-700' : 'border-slate-200 text-slate-500 bg-slate-50'}`} title={EDITOR_UI_ES.tooltipCenterButton}>{EDITOR_UI_ES.centerButton}</button>
              </div>
            </div>

            {buttonSelected && (
              <div className="rounded-xl border border-pink-200 bg-white p-3">
                <p className="text-xs font-semibold text-pink-700 mb-2">{EDITOR_UI_ES.quickButtonEditTitle}</p>
                <div className="grid grid-cols-1 gap-2">
                  <label className="text-xs">
                    <span className="text-slate-600">{EDITOR_UI_ES.ctaText}</span>
                    <input value={buttonQuick.text} onChange={(e) => updateButtonQuick('text', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-slate-200 px-2" />
                  </label>
                  <label className="text-xs">
                    <span className="text-slate-600">{EDITOR_UI_ES.ctaLink}</span>
                    <input value={buttonQuick.href} onChange={(e) => updateButtonQuick('href', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-slate-200 px-2" />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs">
                      <span className="text-slate-600">{EDITOR_UI_ES.ctaButtonColor}</span>
                      <input type="color" value={buttonQuick.bgColor} onChange={(e) => updateButtonQuick('bgColor', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-slate-200 p-1" />
                    </label>
                    <label className="text-xs">
                      <span className="text-slate-600">{EDITOR_UI_ES.ctaTextColor}</span>
                      <input type="color" value={buttonQuick.textColor} onChange={(e) => updateButtonQuick('textColor', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-slate-200 p-1" />
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-xs">
                      <span className="text-slate-600">{EDITOR_UI_ES.ctaRadius}</span>
                      <input type="number" min="0" value={buttonQuick.radius} onChange={(e) => updateButtonQuick('radius', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-slate-200 px-2" />
                    </label>
                    <label className="text-xs">
                      <span className="text-slate-600">{EDITOR_UI_ES.ctaPaddingY}</span>
                      <input type="number" min="0" value={buttonQuick.paddingY} onChange={(e) => updateButtonQuick('paddingY', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-slate-200 px-2" />
                    </label>
                    <label className="text-xs">
                      <span className="text-slate-600">{EDITOR_UI_ES.ctaPaddingX}</span>
                      <input type="number" min="0" value={buttonQuick.paddingX} onChange={(e) => updateButtonQuick('paddingX', e.target.value)} className="mt-1 w-full h-8 rounded-md border border-slate-200 px-2" />
                    </label>
                  </div>
                  <label className="text-xs">
                    <span className="text-slate-600">{EDITOR_UI_ES.ctaWidth}</span>
                    <input value={buttonQuick.width} onChange={(e) => updateButtonQuick('width', e.target.value)} placeholder={EDITOR_UI_ES.buttonWidthPlaceholder} className="mt-1 w-full h-8 rounded-md border border-slate-200 px-2" />
                  </label>
                </div>
              </div>
            )}

            <div className="text-[11px] text-slate-500 space-y-0.5">
              <p>{EDITOR_UI_ES.marginHelp}</p>
              <p>{EDITOR_UI_ES.paddingHelp}</p>
            </div>
          </div>

          <div className="px-3 py-2 border-b border-[#eee3d8]">
            <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50 gap-1">
              {[
                { key: 'styles', label: EDITOR_UI_ES.tabStyles },
                { key: 'traits', label: EDITOR_UI_ES.tabTraits },
                { key: 'blocks', label: EDITOR_UI_ES.tabBlocks },
                { key: 'layers', label: EDITOR_UI_ES.tabLayers },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setInspectorTab(tab.key)}
                  className={`px-2 py-1 text-xs rounded-md ${inspectorTab === tab.key ? 'bg-white border border-slate-200 text-slate-800' : 'text-slate-600'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">{EDITOR_UI_ES.inspectorDescription}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 min-h-0">
            <div className={inspectorTab === 'styles' ? 'block' : 'hidden'}>
              <div id={selectorsId} className="mb-3" />
              <div id={stylesId} />
            </div>
            <div className={inspectorTab === 'traits' ? 'block' : 'hidden'}>
              <div id={traitsId} />
            </div>
            <div className={inspectorTab === 'blocks' ? 'block' : 'hidden'}>
              <div id={blocksId} />
            </div>
            <div className={inspectorTab === 'layers' ? 'block' : 'hidden'}>
              <div id={layersId} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
});

export default GrapesEditor;

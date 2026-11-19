import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Edit3,
  Loader2,
  LogOut,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useAdmin } from '../contexts/AdminContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  clearCmsTextOverride,
  commitCmsDraftSession,
  discardCmsDraftSession,
  getCmsDraftChangeCount,
  markCmsElementDeleted,
  setCmsTextOverride,
  useCmsState,
} from '../utils/cmsStore';

interface ActiveTarget {
  key: string;
  el: HTMLElement;
  rect: DOMRect;
  isTextEditable: boolean;
  isCardBlock: boolean;
  currentText: string;
}

const LEAF_SKIP_TAGS = new Set([
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'SVG',
  'PATH',
  'CIRCLE',
  'RECT',
  'LINE',
  'POLYLINE',
  'POLYGON',
  'IMG',
  'VIDEO',
  'AUDIO',
  'CANVAS',
  'SCRIPT',
  'STYLE',
  'BR',
  'HR',
]);

const COMPLEX_CHILD_TAGS = new Set([
  'DIV',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
  'NAV',
  'MAIN',
  'ASIDE',
  'UL',
  'OL',
  'TABLE',
  'THEAD',
  'TBODY',
  'TR',
  'FORM',
  'FIELDSET',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'BUTTON',
  'A',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'P',
  'LI',
]);

function isInsideNoEdit(el: HTMLElement): boolean {
  return Boolean(
    el.closest('[data-no-admin-edit]') ||
      el.closest('[data-admin-overlay]') ||
      el.closest('[data-admin-grid-add]')
  );
}

function getDirectLeafText(el: HTMLElement): string {
  if (el.children.length === 0) {
    return el.textContent || '';
  }
  let combined = '';
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      combined += node.textContent || '';
    } else if (node instanceof HTMLElement && node.tagName === 'BR') {
      combined += '\n';
    }
  });
  return combined;
}

function setDirectLeafText(el: HTMLElement, newText: string): void {
  if (el.children.length === 0) {
    if (el.textContent !== newText) {
      el.textContent = newText;
    }
    return;
  }

  const textNodes: Text[] = [];
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      textNodes.push(node as Text);
    }
  });

  if (textNodes.length > 0) {
    const primary = textNodes.find((n) => (n.textContent || '').trim().length > 0) || textNodes[0];
    if (primary.textContent !== newText) {
      primary.textContent = newText;
    }
    textNodes.forEach((n) => {
      if (n !== primary && n.textContent !== '') {
        n.textContent = '';
      }
    });
  } else {
    el.appendChild(document.createTextNode(newText));
  }
}

function isSimpleTextElement(el: HTMLElement): boolean {
  if (LEAF_SKIP_TAGS.has(el.tagName)) return false;
  if (el.hasAttribute('data-admin-card')) return false;
  if (el.querySelector('input, textarea, select, option')) return false;

  const childElements = Array.from(el.children) as HTMLElement[];
  if (childElements.length === 0) {
    return (el.textContent || '').trim().length > 0;
  }

  // Allow text elements containing only SVG icons or <br> tags without nested text/container elements
  for (const child of childElements) {
    if (child.tagName === 'SVG' || child.tagName === 'svg' || child.tagName === 'BR') {
      continue;
    }
    if (COMPLEX_CHILD_TAGS.has(child.tagName)) {
      return false;
    }
    // If an inline child (e.g. <span>, <strong>) itself carries text, prefer editing that inner leaf instead
    if ((child.textContent || '').trim().length > 0) {
      return false;
    }
  }

  return getDirectLeafText(el).trim().length > 0;
}

function getAutoEditableKey(el: HTMLElement, root: HTMLElement): string {
  const existing = el.getAttribute('data-admin-editable');
  if (existing) return existing;

  const parts: string[] = [];
  let curr: HTMLElement | null = el;
  while (curr && curr !== root) {
    const parent: HTMLElement | null = curr.parentElement;
    if (!parent) break;
    const tag = curr.tagName;
    const siblings = Array.from(parent.children).filter((c) => c.tagName === tag);
    const idx = siblings.indexOf(curr);
    parts.unshift(`${tag.toLowerCase()}${idx}`);
    curr = parent;
  }
  return `auto:${parts.join('/')}`;
}

export const LiveInlineEditorEngine: React.FC<{ rootId: string }> = ({ rootId }) => {
  const { lang, dir, t } = useLanguage();
  const { isLiveEditorMode, isEditUnlocked, hasPermission, setAdminMode } = useAdmin();
  const cmsState = useCmsState();

  const canEdit = isLiveEditorMode && isEditUnlocked && hasPermission('edit_content');
  const canDelete = isLiveEditorMode && isEditUnlocked && hasPermission('delete_records');

  const [hoveredTarget, setHoveredTarget] = useState<ActiveTarget | null>(null);
  const [editingTarget, setEditingTarget] = useState<ActiveTarget | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccessMsg, setPublishSuccessMsg] = useState<string | null>(null);

  const originalTextMapRef = useRef<WeakMap<HTMLElement, string>>(new WeakMap());

  const unsavedCount = isLiveEditorMode ? getCmsDraftChangeCount() : 0;
  const hasUnsavedChanges = unsavedCount > 0;

  // 1. Apply CMS text overrides & deleted blocks across the entire live viewport
  const applyCmsToDom = useCallback(() => {
    const root = document.getElementById(rootId);
    if (!root) return;

    const semanticCandidates = root.querySelectorAll<HTMLElement>(
      [
        'main h1, main h2, main h3, main h4, main h5, main h6',
        'main p, main li, main span, main strong, main small, main label',
        'main dt, main dd, main th, main td, main figcaption, main blockquote',
        'main button, main a',
        'footer h3, footer h4, footer p, footer li, footer span, footer strong, footer small, footer button, footer a',
        '[data-announcement-bar] span, [data-announcement-bar] p',
        '[data-admin-card], [data-admin-editable]',
      ].join(', ')
    );

    semanticCandidates.forEach((el) => {
      if (isInsideNoEdit(el)) return;
      if (el.closest('[data-admin-custom-card]')) return;

      const isCard = el.hasAttribute('data-admin-card');
      let key = el.getAttribute('data-admin-editable');

      if (!key) {
        if (!isCard && !isSimpleTextElement(el)) return;
        key = getAutoEditableKey(el, root);
        el.setAttribute('data-admin-editable', key);
      } else if (!isCard && !isSimpleTextElement(el)) {
        // Explicit key on a non-leaf container shouldn't overwrite inner markup
        return;
      }

      // Deleted blocks visibility
      if (cmsState.deletedKeys.includes(key)) {
        el.setAttribute('data-cms-deleted', 'true');
        el.style.display = 'none';
      } else if (el.getAttribute('data-cms-deleted') === 'true') {
        el.removeAttribute('data-cms-deleted');
        el.style.display = '';
      }

      // Text override application for leaf text targets
      if (!isCard && isSimpleTextElement(el)) {
        if (!originalTextMapRef.current.has(el)) {
          originalTextMapRef.current.set(el, getDirectLeafText(el));
        }
        const scopedKey = `${lang}:${key}`;
        const overrideText = cmsState.textOverrides[scopedKey];
        if (typeof overrideText === 'string') {
          if (getDirectLeafText(el).trim() !== overrideText.trim()) {
            setDirectLeafText(el, overrideText);
          }
          el.setAttribute('data-cms-overridden', 'true');
        } else if (el.getAttribute('data-cms-overridden') === 'true') {
          const orig = originalTextMapRef.current.get(el);
          if (typeof orig === 'string') {
            setDirectLeafText(el, orig);
          }
          el.removeAttribute('data-cms-overridden');
        }
      }
    });
  }, [rootId, cmsState, lang]);

  useEffect(() => {
    applyCmsToDom();
    const root = document.getElementById(rootId);
    if (!root) return;

    const observer = new MutationObserver(() => {
      applyCmsToDom();
    });
    observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [applyCmsToDom, rootId]);

  // Clear publish confirmation banner automatically after a few seconds
  useEffect(() => {
    if (!publishSuccessMsg) return;
    const timer = window.setTimeout(() => setPublishSuccessMsg(null), 4000);
    return () => window.clearTimeout(timer);
  }, [publishSuccessMsg]);

  // 2. Highlight & Floating Edit/Delete Controls in Live Site Editor Mode
  useEffect(() => {
    if (!isLiveEditorMode || (!canEdit && !canDelete)) {
      setHoveredTarget(null);
      setEditingTarget(null);
      setConfirmingDelete(false);
      return;
    }

    const root = document.getElementById(rootId);
    if (!root) return;

    const resolveTarget = (rawTarget: EventTarget | null): ActiveTarget | null => {
      if (!(rawTarget instanceof Element)) return null;
      const htmlTarget =
        rawTarget instanceof HTMLElement ? rawTarget : rawTarget.closest<HTMLElement>('*');
      if (!htmlTarget) return null;
      if (isInsideNoEdit(htmlTarget)) return null;
      if (htmlTarget.closest('[data-admin-custom-card]')) return null;

      let editableEl = htmlTarget.closest<HTMLElement>('[data-admin-editable]');

      // If pointer landed on an SVG icon inside a button/link whose sibling span is editable, target that span cleanly
      const btnOrLink = htmlTarget.closest<HTMLElement>('button, a');
      if (
        btnOrLink &&
        (!editableEl || editableEl.hasAttribute('data-admin-card'))
      ) {
        const innerLeaf = btnOrLink.querySelector<HTMLElement>(
          '[data-admin-editable]:not([data-admin-card])'
        );
        if (innerLeaf) editableEl = innerLeaf;
      }

      if (!editableEl || !root.contains(editableEl)) return null;
      if (isInsideNoEdit(editableEl)) return null;
      if (editableEl.closest('[data-admin-custom-card]')) return null;

      const key = editableEl.getAttribute('data-admin-editable');
      if (!key) return null;

      const isCardBlock =
        editableEl.hasAttribute('data-admin-card') || !isSimpleTextElement(editableEl);
      const isTextEditable =
        isSimpleTextElement(editableEl) && !editableEl.hasAttribute('data-admin-card');

      return {
        key,
        el: editableEl,
        rect: editableEl.getBoundingClientRect(),
        isTextEditable,
        isCardBlock,
        currentText: isTextEditable
          ? getDirectLeafText(editableEl).trim()
          : editableEl.textContent?.trim() || '',
      };
    };

    const handleMouseOver = (e: MouseEvent) => {
      if (editingTarget) return;
      const next = resolveTarget(e.target);
      if (next) {
        setHoveredTarget(next);
        setConfirmingDelete(false);
      }
    };

    const handleClickCapture = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (target.closest('[data-admin-overlay]')) return;
      if (target.closest('[data-no-admin-edit]')) return;
      if (target.closest('[data-admin-custom-card]')) return;

      const resolved = resolveTarget(target);
      if (!resolved) return;

      const inEditableRegion = Boolean(
        resolved.el.closest('main, footer') || resolved.el.closest('[data-announcement-bar]')
      );
      if (!target.closest('input, textarea, select') && inEditableRegion) {
        if (target.closest('a, button') && !target.closest('[data-admin-grid-add]')) {
          e.preventDefault();
          e.stopPropagation();
        }
        setHoveredTarget(resolved);
        setConfirmingDelete(false);
      }
    };

    const refreshRect = () => {
      setHoveredTarget((prev) =>
        prev && document.body.contains(prev.el)
          ? { ...prev, rect: prev.el.getBoundingClientRect() }
          : null
      );
    };

    root.addEventListener('mouseover', handleMouseOver);
    root.addEventListener('click', handleClickCapture, true);
    window.addEventListener('scroll', refreshRect, true);
    window.addEventListener('resize', refreshRect);

    return () => {
      root.removeEventListener('mouseover', handleMouseOver);
      root.removeEventListener('click', handleClickCapture, true);
      window.removeEventListener('scroll', refreshRect, true);
      window.removeEventListener('resize', refreshRect);
    };
  }, [isLiveEditorMode, canEdit, canDelete, rootId, editingTarget]);

  if (!isLiveEditorMode || (!canEdit && !canDelete)) return null;

  const handleOpenEdit = () => {
    if (!hoveredTarget || !canEdit) return;
    setEditValue(hoveredTarget.currentText);
    setEditingTarget(hoveredTarget);
    setConfirmingDelete(false);
  };

  const handleStageTextEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTarget) return;
    setCmsTextOverride(editingTarget.key, lang, editValue.trim());
    setEditingTarget(null);
    setHoveredTarget(null);
  };

  const handleRestoreOriginal = () => {
    if (!editingTarget) return;
    clearCmsTextOverride(editingTarget.key, lang);
    setEditingTarget(null);
    setHoveredTarget(null);
  };

  const handleConfirmDelete = () => {
    if (!hoveredTarget || !canDelete) return;
    markCmsElementDeleted(hoveredTarget.key);
    setConfirmingDelete(false);
    setHoveredTarget(null);
  };

  const handlePublishFinalSave = async () => {
    if (isPublishing) return;
    setIsPublishing(true);
    try {
      await commitCmsDraftSession();
      setPublishSuccessMsg(
        t(
          'تم حفظ واعتماد جميع التعديلات ونشرها على الموقع بنجاح ✓',
          'All staged edits saved & published live successfully ✓'
        )
      );
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDiscardAndExit = () => {
    discardCmsDraftSession();
    setHoveredTarget(null);
    setEditingTarget(null);
    setConfirmingDelete(false);
    setAdminMode('dashboard');
  };

  // Clamp floating toolbar safely within viewport
  const toolbarTop = hoveredTarget
    ? Math.max(8, Math.min(window.innerHeight - 48, hoveredTarget.rect.top - 36))
    : 0;
  const toolbarLeft = hoveredTarget
    ? Math.max(
        8,
        Math.min(window.innerWidth - 205, hoveredTarget.rect.left + hoveredTarget.rect.width - 170)
      )
    : 0;

  return (
    <div data-admin-overlay="true">
      {/* Dashed highlight outlines for ALL discoverable editable elements */}
      <style>{`
        #${rootId} [data-admin-editable]:hover {
          outline: 2px dashed #C6A052 !important;
          outline-offset: 2px;
          cursor: pointer;
        }
      `}</style>

      {/* Active Target Highlight Box + Floating Edit / Delete Pill */}
      {hoveredTarget && !editingTarget && (
        <>
          <div
            className="fixed pointer-events-none z-40 rounded-lg border-2 border-[#C6A052] bg-[#C6A052]/10 transition-all duration-75"
            style={{
              top: hoveredTarget.rect.top - 2,
              left: hoveredTarget.rect.left - 2,
              width: hoveredTarget.rect.width + 4,
              height: hoveredTarget.rect.height + 4,
            }}
          />

          <div
            className="fixed z-50 flex items-center gap-1.5 bg-[#0A1926] text-white px-2 py-1 rounded-xl shadow-2xl border border-[#C6A052] text-[11px] font-black"
            style={{ top: toolbarTop, left: toolbarLeft }}
            dir={dir}
          >
            {hoveredTarget.isTextEditable && canEdit && (
              <button
                type="button"
                onClick={handleOpenEdit}
                className="px-2.5 py-1 rounded-lg bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] flex items-center gap-1 cursor-pointer transition"
              >
                <Edit3 className="w-3 h-3" />
                <span>{t('تعديل', 'Edit')}</span>
              </button>
            )}

            {canDelete && (
              confirmingDelete ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                  >
                    {t('تأكيد الحذف', 'Confirm')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="px-2 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                  >
                    {t('إلغاء', 'Cancel')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="px-2 py-1 rounded-lg bg-red-600/90 hover:bg-red-600 text-white flex items-center gap-1 cursor-pointer transition"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{t('حذف', 'Delete')}</span>
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => {
                setHoveredTarget(null);
                setConfirmingDelete(false);
              }}
              className="p-1 rounded-lg hover:bg-white/15 text-slate-300 cursor-pointer"
              aria-label={t('إغلاق التحديد', 'Deselect')}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </>
      )}

      {/* Inline Text Edit Popover Modal (Stages to Draft Preview) */}
      {editingTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setEditingTarget(null)}
        >
          <form
            onSubmit={handleStageTextEdit}
            onClick={(e) => e.stopPropagation()}
            dir={dir}
            className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 shadow-2xl overflow-hidden text-start"
          >
            <div className="bg-[#0F2438] text-white px-4 py-3 flex items-center justify-between border-b-2 border-[#C6A052]">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[#E5C887]" />
                <span className="text-xs sm:text-sm font-black">
                  {t('تعديل النص في المسودة', 'Stage Text Edit')} ({lang.toUpperCase()})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingTarget(null)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-3">
              <textarea
                rows={4}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-[#0F2438] focus:outline-none focus:ring-2 focus:ring-[#C6A052]"
              />
              <p className="text-[11px] text-slate-500">
                {t(
                  'سيتم تطبيق التعديل في المعاينة المؤقتة فقط، ولن يظهر للزوار إلا بعد الضغط على "حفظ واعتماد نهائي".',
                  'Changes stay in draft preview and are NOT published until you click "Confirm & Publish Save".'
                )}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{t('تطبيق في المسودة', 'Apply to Draft')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRestoreOriginal}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t('استعادة النص الأصلي', 'Restore Original')}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Sticky Bottom Draft Confirmation Bar (شريط حفظ أو إلغاء التعديلات) */}
      <div
        dir={dir}
        data-admin-overlay="true"
        data-no-admin-edit="true"
        className="fixed bottom-[70px] md:bottom-4 inset-x-3 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-50 md:w-full md:max-w-3xl pointer-events-auto"
      >
        {hasUnsavedChanges ? (
          <div className="bg-[#0A1926]/95 backdrop-blur-md text-white rounded-2xl border-2 border-[#C6A052] shadow-2xl px-3.5 py-3 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/50 text-amber-300 flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-black text-[#E5C887]">
                    {t('تعديلات غير محفوظة في المسودة', 'Unsaved Draft Changes')}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500 text-[#0A1926] text-[10.5px] font-black tabular-nums">
                    {t(`${unsavedCount} تعديل`, `${unsavedCount} staged`)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  {t(
                    'لن تظهر هذه التعديلات للزوار إلا بعد تأكيد الحفظ النهائي.',
                    'Edits are hidden from visitors until you confirm publish.'
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handlePublishFinalSave}
                disabled={isPublishing}
                className="flex-1 sm:flex-none min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer whitespace-nowrap"
              >
                {isPublishing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{t('حفظ واعتماد نهائي', 'Confirm & Publish Save')}</span>
              </button>

              <button
                type="button"
                onClick={handleDiscardAndExit}
                disabled={isPublishing}
                className="flex-1 sm:flex-none min-h-[40px] px-3.5 py-2 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-200 hover:text-white border border-red-400/50 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
              >
                <X className="w-4 h-4" />
                <span>{t('إلغاء والخروج بدون حفظ', 'Discard & Exit')}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#0F2438]/95 backdrop-blur-md text-white rounded-2xl border border-[#C6A052]/70 shadow-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              {publishSuccessMsg ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-black text-emerald-300">{publishSuccessMsg}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-[#E5C887] shrink-0" />
                  <span className="font-bold text-slate-200">
                    {t(
                      'وضع التعديل المباشر نشط — اضغط على أي نص أو زر أو بطاقة لتعديلها',
                      'Live Site Editor Active — Click any text, button, badge, or card to edit'
                    )}
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleDiscardAndExit}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[#E5C887] text-[11px] font-black flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('العودة للوحة الإدارة', 'Back to Dashboard')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Edit3, RotateCcw, Trash2, X } from 'lucide-react';
import { useAdmin } from '../contexts/AdminContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  clearCmsTextOverride,
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
  'IMG',
  'SCRIPT',
  'STYLE',
]);

function isInsideNoEdit(el: HTMLElement): boolean {
  return Boolean(el.closest('[data-no-admin-edit]'));
}

function isSimpleTextElement(el: HTMLElement): boolean {
  if (LEAF_SKIP_TAGS.has(el.tagName)) return false;
  // Allow elements whose children are at most trivial inline text formatting or none
  const childElements = Array.from(el.children);
  if (childElements.length === 0) return true;
  // Don't hijack complex multi-control cards as raw single text string
  const hasInteractiveOrComplex = childElements.some((ch) =>
    ['BUTTON', 'A', 'INPUT', 'SELECT', 'UL', 'DIV', 'SECTION'].includes(ch.tagName)
  );
  return !hasInteractiveOrComplex && el.innerText.trim().length > 0 && el.children.length <= 1;
}

function getAutoEditableKey(el: HTMLElement, root: HTMLElement): string {
  const existing = el.getAttribute('data-admin-editable');
  if (existing) return existing;

  // Deterministic structural path within root
  const parts: string[] = [];
  let curr: HTMLElement | null = el;
  while (curr && curr !== root) {
    const parent: HTMLElement | null = curr.parentElement;
    if (!parent) break;
    const tag = curr.tagName;
    const siblings = Array.from(parent.children).filter(
      (c) => c.tagName === tag
    );
    const idx = siblings.indexOf(curr);
    parts.unshift(`${tag.toLowerCase()}${idx}`);
    curr = parent;
  }
  return `auto:${parts.join('/')}`;
}

export const LiveInlineEditorEngine: React.FC<{ rootId: string }> = ({ rootId }) => {
  const { lang, dir, t } = useLanguage();
  const { isLiveEditorMode, hasPermission } = useAdmin();
  const cmsState = useCmsState();

  const canEdit = isLiveEditorMode && hasPermission('edit_content');
  const canDelete = isLiveEditorMode && hasPermission('delete_records');

  const [hoveredTarget, setHoveredTarget] = useState<ActiveTarget | null>(null);
  const [editingTarget, setEditingTarget] = useState<ActiveTarget | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const originalTextMapRef = useRef<WeakMap<HTMLElement, string>>(new WeakMap());

  // 1. Apply CMS text overrides & deleted blocks across the entire live viewport (for ALL visitors & admins)
  const applyCmsToDom = useCallback(() => {
    const root = document.getElementById(rootId);
    if (!root) return;

    // Auto-discover unmarked semantic text & card blocks so future sections inherit live edit/delete automatically
    const semanticCandidates = root.querySelectorAll<HTMLElement>(
      'main h1, main h2, main h3, main h4, main p, main li, footer h3, footer p, [data-admin-card], [data-admin-editable]'
    );

    semanticCandidates.forEach((el) => {
      if (isInsideNoEdit(el)) return;
      if (el.closest('[data-admin-custom-card]')) return; // Custom CMS cards have dedicated React CRUD

      let key = el.getAttribute('data-admin-editable');
      if (!key) {
        // Only auto-tag leaf text or marked cards
        const isCard = el.hasAttribute('data-admin-card');
        if (!isCard && !isSimpleTextElement(el)) return;
        key = getAutoEditableKey(el, root);
        el.setAttribute('data-admin-editable', key);
      }

      // Deleted blocks visibility
      if (cmsState.deletedKeys.includes(key)) {
        el.setAttribute('data-cms-deleted', 'true');
        el.style.display = 'none';
      } else if (el.getAttribute('data-cms-deleted') === 'true') {
        el.removeAttribute('data-cms-deleted');
        el.style.display = '';
      }

      // Text override application (for leaf text targets)
      if (isSimpleTextElement(el) && !el.hasAttribute('data-admin-card')) {
        if (!originalTextMapRef.current.has(el)) {
          originalTextMapRef.current.set(el, el.textContent || '');
        }
        const scopedKey = `${lang}:${key}`;
        const overrideText = cmsState.textOverrides[scopedKey];
        if (typeof overrideText === 'string') {
          if (el.textContent !== overrideText) {
            el.textContent = overrideText;
          }
          el.setAttribute('data-cms-overridden', 'true');
        } else if (el.getAttribute('data-cms-overridden') === 'true') {
          const orig = originalTextMapRef.current.get(el);
          if (typeof orig === 'string') {
            el.textContent = orig;
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
      if (!(rawTarget instanceof HTMLElement)) return null;
      if (rawTarget.closest('[data-admin-overlay]')) return null;
      if (rawTarget.closest('[data-no-admin-edit]')) return null;
      const editableEl = rawTarget.closest<HTMLElement>('[data-admin-editable]');
      if (!editableEl || !root.contains(editableEl)) return null;
      if (editableEl.closest('[data-admin-custom-card]')) return null;

      const key = editableEl.getAttribute('data-admin-editable');
      if (!key) return null;

      const isCardBlock =
        editableEl.hasAttribute('data-admin-card') || !isSimpleTextElement(editableEl);
      const isTextEditable = isSimpleTextElement(editableEl) && !editableEl.hasAttribute('data-admin-card');

      return {
        key,
        el: editableEl,
        rect: editableEl.getBoundingClientRect(),
        isTextEditable,
        isCardBlock,
        currentText: editableEl.textContent?.trim() || '',
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
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-admin-overlay]')) return;
      if (target.closest('[data-no-admin-edit]')) return;
      if (target.closest('[data-admin-custom-card]')) return;

      const resolved = resolveTarget(target);
      if (!resolved) return;

      // On mobile/touch or direct tap in Live Editor mode: select target cleanly
      if (
        !target.closest('input, textarea, select') &&
        (resolved.el.closest('main, footer') || resolved.el.closest('[data-announcement-bar]'))
      ) {
        // Prevent accidental outbound links/WhatsApp triggers while selecting editable elements
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

  const handleSaveEdit = (e: React.FormEvent) => {
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

  // Clamp floating toolbar safely within viewport
  const toolbarTop = hoveredTarget
    ? Math.max(8, Math.min(window.innerHeight - 48, hoveredTarget.rect.top - 34))
    : 0;
  const toolbarLeft = hoveredTarget
    ? Math.max(
        8,
        Math.min(window.innerWidth - 190, hoveredTarget.rect.left + hoveredTarget.rect.width - 155)
      )
    : 0;

  return (
    <div data-admin-overlay="true">
      {/* Subtle Visual Dashed Outlines CSS during Live Editor Mode */}
      <style>{`
        #${rootId} [data-admin-editable]:hover {
          outline: 2px dashed #C6A052 !important;
          outline-offset: 2px;
        }
      `}</style>

      {/* Active Target Highlight Box + Floating Edit / Delete Pill */}
      {hoveredTarget && !editingTarget && (
        <>
          <div
            className="fixed pointer-events-none z-40 rounded-lg border-2 border-[#C6A052] bg-[#C6A052]/5 transition-all duration-75"
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
                className="px-2 py-1 rounded-lg bg-[#C6A052] hover:bg-[#d4b063] text-[#0A1926] flex items-center gap-1 cursor-pointer transition"
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

      {/* Inline Text Edit Popover Modal */}
      {editingTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setEditingTarget(null)}
        >
          <form
            onSubmit={handleSaveEdit}
            onClick={(e) => e.stopPropagation()}
            dir={dir}
            className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 shadow-2xl overflow-hidden text-start"
          >
            <div className="bg-[#0F2438] text-white px-4 py-3 flex items-center justify-between border-b-2 border-[#C6A052]">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[#E5C887]" />
                <span className="text-xs sm:text-sm font-black">
                  {t('تعديل النص مباشرة', 'Live Inline Text Editor')} ({lang.toUpperCase()})
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

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#0F2438] hover:bg-[#163B65] text-[#E5C887] text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{t('حفظ التعديل فوراً', 'Save Changes')}</span>
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
    </div>
  );
};

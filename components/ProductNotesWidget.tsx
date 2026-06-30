"use client";

import React, { useState, useRef, useEffect } from "react";
import { StickyNote, Plus, Trash2, Pencil, Check, X, Calendar, Edit2, AlertCircle, Loader2 } from "lucide-react";
import { createProductNote, updateProductNote, deleteProductNote } from "@/app/actions/product-notes";

interface Note {
  id: string;
  product_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface ProductNotesWidgetProps {
  productId: string;
  notes: Note[];
  canEdit: boolean;
}

export default function ProductNotesWidget({
  productId,
  notes,
  canEdit,
}: ProductNotesWidgetProps) {
  const [newNote, setNewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea for adding notes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [newNote]);

  // Auto-resize textarea for editing notes
  useEffect(() => {
    if (editRef.current) {
      editRef.current.style.height = "auto";
      editRef.current.style.height = `${editRef.current.scrollHeight}px`;
      editRef.current.focus();
      // Move cursor to end
      const val = editRef.current.value;
      editRef.current.value = "";
      editRef.current.value = val;
    }
  }, [editingId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newNote.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createProductNote(productId, trimmed);
      setNewNote("");
    } catch (err: any) {
      alert(err.message || "Not eklenemedi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async (noteId: string) => {
    const trimmed = editingText.trim();
    if (!trimmed || isSaving) return;

    setIsSaving(true);
    try {
      await updateProductNote(noteId, productId, trimmed);
      setEditingId(null);
      setEditingText("");
    } catch (err: any) {
      alert(err.message || "Not güncellenemedi.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteProductNote(noteId, productId);
      setDeletingId(null);
    } catch (err: any) {
      alert(err.message || "Not silinemedi.");
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm border-t-4 border-t-teal-600 transition hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-teal-50 p-1.5 text-teal-700">
            <StickyNote className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
              Operasyon
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900 [font-family:var(--font-display)]">
              Ürün Notları
            </h2>
          </div>
        </div>
        <span className="rounded-lg bg-teal-50 border border-teal-100 px-2.5 py-1 text-xs font-bold text-teal-700">
          {notes.length} Not
        </span>
      </div>

      {/* Add Note Form */}
      {canEdit && (
        <form onSubmit={handleAdd} className="mt-4">
          <div className="relative rounded-xl border border-slate-200 bg-slate-50/50 p-1.5 focus-within:border-teal-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-teal-500 transition-all duration-200">
            <textarea
              ref={textareaRef}
              rows={1}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              disabled={isSubmitting}
              placeholder="Hızlıca bir not yazın... (Enter ile kaydet, Shift+Enter ile alt satır)"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAdd(e);
                }
              }}
              className="w-full resize-none border-0 bg-transparent px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-0 min-h-[38px] max-h-[150px] overflow-y-auto"
            />
            <div className="flex items-center justify-end px-2 pb-1 pt-1">
              <button
                type="submit"
                disabled={!newNote.trim() || isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#101817] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#182322] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-w-[75px] justify-center"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Ekleniyor...
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    Ekle
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Notes List */}
      <div className="mt-5 space-y-3 max-h-[350px] overflow-y-auto pr-1">
        {notes.length ? (
          notes.map((note) => {
            const isEditing = editingId === note.id;
            const isDeletingSelected = deletingId === note.id;
            const isEdited = note.updated_at !== note.created_at;

            return (
              <div
                key={note.id}
                className={`group relative rounded-xl border border-slate-100 p-4 transition-all duration-200 ${
                  isEditing 
                    ? "border-teal-500 bg-teal-50/10 shadow-sm" 
                    : isDeletingSelected
                    ? "border-rose-200 bg-rose-50/10"
                    : "bg-slate-50/20 hover:border-slate-200 hover:bg-white hover:shadow-sm"
                }`}
              >
                {isEditing ? (
                  /* Edit Mode */
                  <div className="space-y-3">
                    <textarea
                      ref={editRef}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      disabled={isSaving}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSaveEdit(note.id);
                        } else if (e.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      className="w-full resize-none rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 min-h-[50px]"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setEditingId(null)}
                        disabled={isSaving}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                        İptal
                      </button>
                      <button
                        onClick={() => handleSaveEdit(note.id)}
                        disabled={!editingText.trim() || isSaving}
                        className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-50 cursor-pointer min-w-[80px] justify-center"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Kayıt...
                          </>
                        ) : (
                          <>
                            <Check className="h-3 w-3" />
                            Kaydet
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : isDeletingSelected ? (
                  /* Delete Confirmation Mode */
                  <div className="flex flex-col items-center justify-between gap-3 text-center py-1 sm:flex-row sm:text-left">
                    <div className="flex items-center gap-2 text-rose-800 text-xs font-medium">
                      <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                      <span>Bu not kalıcı olarak silinsin mi?</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setDeletingId(null)}
                        disabled={isDeleting}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                      >
                        İptal
                      </button>
                      <button
                        onClick={() => handleDelete(note.id)}
                        disabled={isDeleting}
                        className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 cursor-pointer min-w-[85px] justify-center flex items-center gap-1"
                      >
                        {isDeleting ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Siliniyor...
                          </>
                        ) : (
                          "Evet, Sil"
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Standard Mode */
                  <div>
                    {/* Content */}
                    <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed break-words pr-8">
                      {note.content}
                    </p>

                    {/* Metadata & Actions */}
                    <div className="mt-3 flex items-center justify-between text-[11px] font-medium text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDateTime(note.created_at)}
                        {isEdited && (
                          <span className="text-[10px] text-teal-600 bg-teal-50 px-1 rounded-sm border border-teal-100/50">
                            düzenlendi
                          </span>
                        )}
                      </span>

                      {/* Hover Actions */}
                      {canEdit && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <button
                            onClick={() => {
                              setEditingId(note.id);
                              setEditingText(note.content);
                            }}
                            title="Düzenle"
                            className="rounded p-1 hover:bg-slate-100 hover:text-slate-700 text-slate-400 transition cursor-pointer"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setDeletingId(note.id)}
                            title="Sil"
                            className="rounded p-1 hover:bg-rose-50 hover:text-rose-600 text-slate-400 transition cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <StickyNote className="h-8 w-8 opacity-40 stroke-[1.5]" />
            <p className="mt-2 text-xs font-semibold">Henüz not eklenmemiş.</p>
            {canEdit && <p className="text-[10px] opacity-80 mt-0.5">Yukarıdaki alandan ilk notu ekleyebilirsiniz.</p>}
          </div>
        )}
      </div>
    </section>
  );
}

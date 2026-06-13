'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, Loader2, Trash2, Upload, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fmtShortDate } from '@/lib/format';
import type { Resource } from '@/lib/types';
import { CardSkeleton } from '@/components/ui';

type Student = { id: string; name: string };

// Onglet DOCUMENTS : le tuteur partage des fichiers de cours
// (fiches, sujets, corrigés…) avec un élève ou avec tous.
export default function DocumentsTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: studentRows } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('role', 'student')
      .order('name');
    setStudents(studentRows ?? []);

    const { data } = await supabase
      .from('resources')
      .select('*, student:profiles!resources_student_id_fkey(name)')
      .order('created_at', { ascending: false });
    setResources((data as unknown as Resource[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function download(r: Resource) {
    const { data } = await supabase.storage.from('resources').createSignedUrl(r.file_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  async function remove(r: Resource) {
    await supabase.storage.from('resources').remove([r.file_path]);
    await supabase.from('resources').delete().eq('id', r.id);
    load();
  }

  if (loading) return <CardSkeleton />;

  return (
    <div className="fade-in flex flex-col gap-6">
      <UploadForm students={students} onUploaded={load} />

      <section>
        <h2 className="mb-3 text-lg font-bold">Documents partagés</h2>
        {resources.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
            Aucun document pour l&apos;instant.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {resources.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                    <Users className="h-4 w-4" />
                    {r.student?.name ?? 'Tous les élèves'} · {fmtShortDate(r.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => download(r)}
                    title="Télécharger"
                    className="rounded-xl border border-indigo-300 p-2 text-indigo-700 active:scale-95 dark:border-indigo-700 dark:text-indigo-300"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(r)}
                    title="Supprimer"
                    className="rounded-xl border border-slate-300 p-2 text-slate-500 active:scale-95 dark:border-slate-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function UploadForm({
  students,
  onUploaded,
}: {
  students: Student[];
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [studentId, setStudentId] = useState('');
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);

    const path = `cours/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: uploadError } = await supabase.storage
      .from('resources')
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setError(`Échec de l'envoi : ${uploadError.message}`);
      setUploading(false);
      return;
    }

    const { error: dbError } = await supabase.from('resources').insert({
      student_id: studentId || null, // vide = partagé avec tous
      title: title.trim() || file.name,
      file_path: path,
      file_name: file.name,
    });
    if (dbError) {
      setError(`Fichier envoyé mais non enregistré : ${dbError.message}`);
      setUploading(false);
      return;
    }
    setTitle('');
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    onUploaded();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <FolderOpen className="h-5 w-5 text-indigo-600" /> Partager un document
      </h2>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre (ex : Fiche — Équations du 1er degré)"
            className="w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-800 sm:flex-1"
          />
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-800 sm:w-56"
          >
            <option value="">Tous les élèves</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.txt"
          className="hidden"
          onChange={handleFile}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white active:scale-95 disabled:opacity-60 sm:self-start"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploading ? 'Envoi en cours…' : 'Choisir le fichier et partager'}
        </button>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </div>
    </section>
  );
}

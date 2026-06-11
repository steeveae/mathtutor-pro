// Formats d'affichage français partagés entre les interfaces Tuteur et Élève.

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export function sessionMinutes(s: {
  start_time: string | null;
  end_time: string | null;
}) {
  if (!s.start_time || !s.end_time) return 0;
  return (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 60000;
}

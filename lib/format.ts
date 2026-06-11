// Formats d'affichage français partagés entre les interfaces.

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
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

export function fmtMoney(amount: number) {
  return `${Math.round(amount).toLocaleString('fr-FR')} FCFA`;
}

export function sessionMinutes(s: {
  start_time: string | null;
  end_time: string | null;
}) {
  if (!s.start_time || !s.end_time) return 0;
  return (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 60000;
}

// Montant d'une session = durée réelle × tarif horaire de l'élève
export function sessionAmount(
  s: { start_time: string | null; end_time: string | null },
  hourlyRate: number
) {
  return (sessionMinutes(s) / 60) * hourlyRate;
}

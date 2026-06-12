// Types partagés entre les interfaces Tuteur, Élève et Parent.

export type Role = 'tutor' | 'student' | 'parent';

export type Profile = {
  id: string;
  role: Role;
  name: string;
  email: string;
  hourly_rate: number; // FCFA / heure
  linked_parent_id: string | null;
  notification_prefs?: Record<string, boolean> | null; // clé absente = activé
};

export type Subject = {
  id: string;
  tutor_id: string;
  name: string;
  hourly_rate: number | null; // null = utiliser le tarif de l'élève
  created_at: string;
};

export type Session = {
  id: string;
  student_id: string;
  tutor_id?: string;
  scheduled_time: string;
  start_time: string | null;
  end_time: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  notes: string | null;
  live_content: string | null;
  group_key?: string | null; // sessions d'un même cours collectif
  subject_id?: string | null;
  student?: { name: string } | null;
  subject?: { name: string; hourly_rate?: number | null } | null;
};

export type Homework = {
  id: string;
  student_id: string;
  tutor_id?: string | null;
  description: string;
  deadline: string | null;
  photo_url: string | null;
  feedback: string | null;
  grade: number | null;
  status: 'pending' | 'submitted' | 'graded';
  created_at: string;
  subject_id?: string | null;
  student?: { name: string } | null;
  subject?: { name: string } | null;
};

export type HomeworkFile = {
  id: string;
  homework_id: string;
  file_path: string;
  file_name: string;
  created_at: string;
};

export type Resource = {
  id: string;
  student_id: string | null; // null = partagé avec tous les élèves
  title: string;
  file_path: string;
  file_name: string;
  created_at: string;
  student?: { name: string } | null;
};

export type SessionMessage = {
  id: string;
  session_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

export type Slide = {
  id: string;
  session_id: string;
  content: string;
  created_at: string;
};

'use client';

import { useEffect, useRef, useState } from 'react';
import { Headphones, Loader2, Mic, MicOff, PhoneOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ============================================================
// Appel AUDIO en direct, sans service externe ni limite de
// durée : WebRTC pair-à-pair entre les participants, la
// signalisation passe par Supabase Realtime (canal de la salle).
// Tous les participants d'une même session (room) s'entendent.
// ============================================================

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    // Découverte d'adresse (STUN, gratuit)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Relais de secours (TURN) pour les réseaux mobiles stricts
    {
      urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

type Signal =
  | { kind: 'offer' | 'answer'; from: string; to: string; name: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; from: string; to: string; candidate: RTCIceCandidateInit };

export default function AudioCall({
  room,
  userId,
  userName,
}: {
  room: string;
  userId: string;
  userName: string;
}) {
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<Record<string, string>>({}); // id → nom (audio connecté)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localRef = useRef<MediaStream | null>(null);
  const audiosRef = useRef<HTMLDivElement>(null);

  // Raccroche proprement si on quitte la page
  useEffect(() => leave, []); // eslint-disable-line react-hooks/exhaustive-deps

  function send(payload: Signal) {
    channelRef.current?.send({ type: 'broadcast', event: 'signal', payload });
  }

  function getOrCreatePc(peerId: string, name: string) {
    let pc = pcsRef.current.get(peerId);
    if (pc) return pc;
    pc = new RTCPeerConnection(RTC_CONFIG);
    pcsRef.current.set(peerId, pc);

    // Mon micro vers ce participant
    localRef.current?.getTracks().forEach((t) => pc!.addTrack(t, localRef.current!));

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        send({ kind: 'ice', from: userId, to: peerId, candidate: e.candidate.toJSON() });
      }
    };

    // Son du participant → lecteur audio invisible
    pc.ontrack = (e) => {
      if (!audiosRef.current) return;
      let el = document.getElementById(`audio-${peerId}`) as HTMLAudioElement | null;
      if (!el) {
        el = document.createElement('audio');
        el.id = `audio-${peerId}`;
        el.autoplay = true;
        audiosRef.current.appendChild(el);
      }
      el.srcObject = e.streams[0];
    };

    pc.onconnectionstatechange = () => {
      if (pc!.connectionState === 'connected') {
        setPeers((p) => ({ ...p, [peerId]: name }));
      }
      if (['failed', 'closed'].includes(pc!.connectionState)) {
        closePc(peerId);
      }
    };
    return pc;
  }

  function closePc(peerId: string) {
    pcsRef.current.get(peerId)?.close();
    pcsRef.current.delete(peerId);
    document.getElementById(`audio-${peerId}`)?.remove();
    setPeers((p) => {
      const next = { ...p };
      delete next[peerId];
      return next;
    });
  }

  async function makeOffer(peerId: string, name: string) {
    const pc = getOrCreatePc(peerId, name);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ kind: 'offer', from: userId, to: peerId, name: userName, sdp: offer });
  }

  // Pour chaque participant présent : celui dont l'identifiant est
  // le plus petit appelle l'autre (jamais de collision d'appels).
  function reconcile() {
    const state = channelRef.current?.presenceState() as
      | Record<string, { name?: string }[]>
      | undefined;
    if (!state || !localRef.current) return;
    for (const [peerId, metas] of Object.entries(state)) {
      if (peerId === userId || pcsRef.current.has(peerId)) continue;
      if (userId < peerId) makeOffer(peerId, metas[0]?.name ?? 'Participant');
    }
  }

  async function join() {
    setConnecting(true);
    setError(null);

    // 1. Micro (audio uniquement)
    try {
      localRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError("Micro inaccessible : autorise le micro dans ton navigateur puis réessaie.");
      setConnecting(false);
      return;
    }

    // 2. Canal de signalisation de la salle
    const channel = supabase.channel(`call-${room}`, {
      config: { presence: { key: userId }, broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel.on('broadcast', { event: 'signal' }, async ({ payload }) => {
      const sig = payload as Signal;
      if (sig.to !== userId) return;
      try {
        if (sig.kind === 'offer') {
          const pc = getOrCreatePc(sig.from, sig.name);
          await pc.setRemoteDescription(sig.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ kind: 'answer', from: userId, to: sig.from, name: userName, sdp: answer });
        } else if (sig.kind === 'answer') {
          const pc = pcsRef.current.get(sig.from);
          if (pc && !pc.currentRemoteDescription) await pc.setRemoteDescription(sig.sdp);
        } else if (sig.kind === 'ice') {
          await pcsRef.current.get(sig.from)?.addIceCandidate(sig.candidate);
        }
      } catch {
        // un signal isolé qui échoue n'interrompt pas l'appel
      }
    });

    channel.on('presence', { event: 'sync' }, reconcile);
    channel.on('presence', { event: 'leave' }, ({ key }) => closePc(key));

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ name: userName });
        setJoined(true);
        setConnecting(false);
        reconcile();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setError('Connexion impossible. Vérifie ta connexion internet et réessaie.');
        leave();
      }
    });
  }

  function leave() {
    for (const peerId of [...pcsRef.current.keys()]) closePc(peerId);
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setJoined(false);
    setConnecting(false);
    setMuted(false);
    setPeers({});
  }

  function toggleMute() {
    const next = !muted;
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }

  const peerNames = Object.values(peers);

  return (
    <div>
      {/* Lecteurs audio des participants (invisibles) */}
      <div ref={audiosRef} className="hidden" />

      {!joined ? (
        <button
          onClick={join}
          disabled={connecting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {connecting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Headphones className="h-5 w-5" />
          )}
          {connecting ? 'Connexion…' : 'Rejoindre le cours audio 🎧'}
        </button>
      ) : (
        <div className="rounded-xl border-2 border-emerald-500 bg-white p-3 dark:bg-slate-800">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
            <span className="relative flex h-3 w-3">
              <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative h-3 w-3 rounded-full bg-emerald-600" />
            </span>
            Audio en direct
            <span className="ml-auto font-normal text-slate-500 dark:text-slate-400">
              {peerNames.length === 0
                ? 'En attente des autres…'
                : `Avec : ${peerNames.join(', ')}`}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleMute}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold active:scale-95 ${
                muted
                  ? 'bg-amber-500 text-white'
                  : 'border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'
              }`}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {muted ? 'Micro coupé' : 'Couper le micro'}
            </button>
            <button
              onClick={leave}
              className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white active:scale-95"
            >
              <PhoneOff className="h-4 w-4" /> Quitter
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Headphones, Loader2, Mic, MicOff, PhoneOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ============================================================
// Cours AUDIO en direct (WebRTC pair-à-pair, sans limite).
// Signalisation via Supabase Realtime (présence + broadcast).
// Règle anti-collision : pour chaque paire, c'est l'identifiant
// le plus petit qui appelle l'autre.
// ============================================================

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    // Relais de secours (réseaux mobiles stricts)
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

type Signal =
  | { kind: 'hello'; from: string; name: string }
  | { kind: 'offer' | 'answer'; from: string; to: string; name: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; from: string; to: string; candidate: RTCIceCandidateInit };

type Peer = {
  pc: RTCPeerConnection;
  name: string;
  hasRemote: boolean;
  pendingIce: RTCIceCandidateInit[]; // candidats arrivés trop tôt, à rejouer
};

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
  const [roster, setRoster] = useState<Record<string, string>>({}); // présents dans la salle
  const [connected, setConnected] = useState<Record<string, boolean>>({}); // audio établi

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const localRef = useRef<MediaStream | null>(null);
  const audiosRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const joinedRef = useRef(false);

  // Raccroche uniquement si le composant disparaît (fin de session)
  useEffect(() => leave, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Garde l'écran allumé pendant l'appel (re-demandé au retour sur l'app)
  useEffect(() => {
    async function requestWakeLock() {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> };
        };
        if (joinedRef.current && document.visibilityState === 'visible' && nav.wakeLock) {
          wakeLockRef.current = await nav.wakeLock.request('screen');
        }
      } catch {}
    }
    document.addEventListener('visibilitychange', requestWakeLock);
    return () => document.removeEventListener('visibilitychange', requestWakeLock);
  }, []);

  function send(payload: Signal) {
    channelRef.current?.send({ type: 'broadcast', event: 'signal', payload });
  }

  function getOrCreatePeer(peerId: string, name: string): Peer {
    let peer = peersRef.current.get(peerId);
    if (peer) return peer;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peer = { pc, name, hasRemote: false, pendingIce: [] };
    peersRef.current.set(peerId, peer);

    localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current!));

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        send({ kind: 'ice', from: userId, to: peerId, candidate: e.candidate.toJSON() });
      }
    };

    pc.ontrack = (e) => {
      if (!audiosRef.current) return;
      let el = document.getElementById(`audio-${peerId}`) as HTMLAudioElement | null;
      if (!el) {
        el = document.createElement('audio');
        el.id = `audio-${peerId}`;
        el.autoplay = true;
        (el as HTMLAudioElement & { playsInline: boolean }).playsInline = true;
        audiosRef.current.appendChild(el);
      }
      el.srcObject = e.streams[0];
      el.play().catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        setConnected((c) => ({ ...c, [peerId]: true }));
      } else if (state === 'failed') {
        // Échec réseau : on repart de zéro, l'initiateur rappellera
        closePeer(peerId);
        setTimeout(reconcile, 1200);
      } else if (state === 'closed') {
        closePeer(peerId);
      }
    };
    return peer;
  }

  function closePeer(peerId: string) {
    peersRef.current.get(peerId)?.pc.close();
    peersRef.current.delete(peerId);
    document.getElementById(`audio-${peerId}`)?.remove();
    setConnected((c) => {
      const next = { ...c };
      delete next[peerId];
      return next;
    });
  }

  async function flushIce(peer: Peer) {
    for (const candidate of peer.pendingIce.splice(0)) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch {}
    }
  }

  async function makeOffer(peerId: string, name: string) {
    try {
      const peer = getOrCreatePeer(peerId, name);
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      send({ kind: 'offer', from: userId, to: peerId, name: userName, sdp: offer });
    } catch {}
  }

  // Met à jour la liste des présents et appelle ceux qu'on doit appeler
  function reconcile() {
    const state = channelRef.current?.presenceState() as
      | Record<string, { name?: string }[]>
      | undefined;
    if (!state || !localRef.current) return;

    const others: Record<string, string> = {};
    for (const [peerId, metas] of Object.entries(state)) {
      if (peerId === userId) continue;
      others[peerId] = metas[0]?.name ?? 'Participant';
    }
    setRoster(others);

    for (const [peerId, name] of Object.entries(others)) {
      if (!peersRef.current.has(peerId) && userId < peerId) {
        makeOffer(peerId, name);
      }
    }
  }

  async function handleSignal(sig: Signal) {
    try {
      if (sig.kind === 'hello') {
        // Filet de sécurité si la présence tarde à se synchroniser
        setRoster((r) => ({ ...r, [sig.from]: sig.name }));
        if (!peersRef.current.has(sig.from) && userId < sig.from) {
          await makeOffer(sig.from, sig.name);
        }
        return;
      }
      if (sig.to !== userId) return;

      if (sig.kind === 'offer') {
        const peer = getOrCreatePeer(sig.from, sig.name);
        await peer.pc.setRemoteDescription(sig.sdp);
        peer.hasRemote = true;
        await flushIce(peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        send({ kind: 'answer', from: userId, to: sig.from, name: userName, sdp: answer });
      } else if (sig.kind === 'answer') {
        const peer = peersRef.current.get(sig.from);
        if (peer && !peer.pc.currentRemoteDescription) {
          await peer.pc.setRemoteDescription(sig.sdp);
          peer.hasRemote = true;
          await flushIce(peer);
        }
      } else if (sig.kind === 'ice') {
        const peer = peersRef.current.get(sig.from);
        if (!peer) return;
        if (peer.hasRemote) {
          try {
            await peer.pc.addIceCandidate(sig.candidate);
          } catch {}
        } else {
          // Candidat arrivé avant la description : on le garde pour plus tard
          peer.pendingIce.push(sig.candidate);
        }
      }
    } catch {}
  }

  async function join() {
    setConnecting(true);
    setError(null);

    try {
      localRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError('Micro inaccessible : autorise le micro dans ton navigateur puis réessaie.');
      setConnecting(false);
      return;
    }

    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> };
      };
      wakeLockRef.current = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {}

    const channel = supabase.channel(`call-${room}`, {
      config: { presence: { key: userId }, broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
      handleSignal(payload as Signal);
    });
    channel.on('presence', { event: 'sync' }, reconcile);
    channel.on('presence', { event: 'leave' }, ({ key }) => {
      closePeer(key);
      setRoster((r) => {
        const next = { ...r };
        delete next[key];
        return next;
      });
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ name: userName });
        send({ kind: 'hello', from: userId, name: userName });
        joinedRef.current = true;
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
    joinedRef.current = false;
    for (const peerId of [...peersRef.current.keys()]) closePeer(peerId);
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setJoined(false);
    setConnecting(false);
    setMuted(false);
    setRoster({});
    setConnected({});
  }

  function toggleMute() {
    const next = !muted;
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }

  const rosterEntries = Object.entries(roster);

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
          <div className="mb-1 flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
            <span className="relative flex h-3 w-3">
              <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative h-3 w-3 rounded-full bg-emerald-600" />
            </span>
            Audio en direct
          </div>

          {/* État de chaque participant présent dans la salle */}
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
            {rosterEntries.length === 0 ? (
              'En attente des autres participants…'
            ) : (
              <>
                {rosterEntries.map(([id, name], i) => (
                  <span key={id}>
                    {i > 0 && ' · '}
                    {name} {connected[id] ? '✅' : '⏳ connexion…'}
                  </span>
                ))}
              </>
            )}
          </p>

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

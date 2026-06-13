'use client';

import { useEffect, useRef, useState } from 'react';
import { Hand, Headphones, Loader2, Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ============================================================
// Cours AUDIO en direct (WebRTC pair-à-pair, sans limite).
// Signalisation via Supabase Realtime (présence + broadcast).
// Règle anti-collision : pour chaque paire, c'est l'identifiant
// le plus petit qui appelle l'autre.
//
// Salle modérée :
//  - l'hôte (tuteur) peut toujours parler ;
//  - les élèves sont muets par défaut ; ils « lèvent la main »
//    pour demander la parole ;
//  - l'hôte donne/retire la parole à qui il veut.
// Le rôle est passé en prop : le tuteur peut donc être sur PC
// comme sur téléphone.
// ============================================================

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];
  // Relais TURN dédié (recommandé) : variables Vercel
  // NEXT_PUBLIC_TURN_URL / _USERNAME / _CREDENTIAL
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl.split(',').map((u) => u.trim()),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME ?? '',
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL ?? '',
    });
  } else {
    // Relais public de secours (fiabilité non garantie)
    servers.push({
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    });
  }
  return servers;
}

type Signal =
  | { kind: 'hello'; from: string; name: string }
  | { kind: 'offer' | 'answer'; from: string; to: string; name: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; from: string; to: string; candidate: RTCIceCandidateInit }
  // Un élève lève / baisse la main
  | { kind: 'hand'; from: string; name: string; raised: boolean }
  // La parole est donnée / retirée à un participant
  | { kind: 'floor'; from: string; to: string; granted: boolean };

type Peer = {
  pc: RTCPeerConnection;
  name: string;
  hasRemote: boolean;
  pendingIce: RTCIceCandidateInit[]; // candidats arrivés trop tôt, à rejouer
};

type PeerStatus = 'connecting' | 'connected' | 'failed';

export default function AudioCall({
  room,
  userId,
  userName,
  role = 'student',
}: {
  room: string;
  userId: string;
  userName: string;
  role?: 'host' | 'student';
}) {
  const isHost = role === 'host';

  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roster, setRoster] = useState<Record<string, string>>({}); // présents dans la salle
  const [status, setStatus] = useState<Record<string, PeerStatus>>({});
  const [needsUnlock, setNeedsUnlock] = useState(false); // lecture bloquée par le navigateur
  const [hands, setHands] = useState<Record<string, boolean>>({}); // mains levées
  const [floor, setFloor] = useState<Record<string, boolean>>({}); // qui a la parole
  const [handRaised, setHandRaised] = useState(false); // (élève) ma main est levée

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const localRef = useRef<MediaStream | null>(null);
  const audiosRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const joinedRef = useRef(false);
  const floorRef = useRef<Record<string, boolean>>({}); // miroir de `floor` pour l'hôte

  // L'élève a-t-il la parole ? (l'hôte parle toujours)
  const iHaveFloor = isHost || floor[userId] === true;

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

  function setPeerStatus(peerId: string, s: PeerStatus) {
    setStatus((prev) => ({ ...prev, [peerId]: s }));
  }

  // Active/coupe le micro local selon le rôle, la parole et le mute.
  // L'hôte peut toujours parler ; l'élève seulement s'il a la parole.
  function applyMic(canSpeak: boolean, isMuted: boolean) {
    const enabled = canSpeak && !isMuted;
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = enabled));
  }

  // Tente de lire tous les flux audio ; si le navigateur refuse
  // (politique de lecture automatique mobile), on affiche le
  // bouton « Activer le son » qui relance la lecture sur un clic.
  function playAll() {
    if (!audiosRef.current) return;
    for (const el of Array.from(audiosRef.current.children) as HTMLAudioElement[]) {
      el.play()
        .then(() => setNeedsUnlock(false))
        .catch(() => setNeedsUnlock(true));
    }
  }

  function getOrCreatePeer(peerId: string, name: string): Peer {
    let peer = peersRef.current.get(peerId);
    if (peer) return peer;

    const pc = new RTCPeerConnection({ iceServers: buildIceServers() });
    peer = { pc, name, hasRemote: false, pendingIce: [] };
    peersRef.current.set(peerId, peer);
    setPeerStatus(peerId, 'connecting');

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
      el.play().catch(() => setNeedsUnlock(true));
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        setPeerStatus(peerId, 'connected');
        playAll();
        // L'hôte rappelle aux nouveaux venus qui a déjà la parole
        if (isHost) {
          for (const [sid, granted] of Object.entries(floorRef.current)) {
            if (granted) send({ kind: 'floor', from: userId, to: sid, granted: true });
          }
        }
      } else if (state === 'failed') {
        setPeerStatus(peerId, 'failed');
        // Échec réseau : on repart de zéro, l'initiateur rappellera
        closePeer(peerId, true);
        setTimeout(reconcile, 1500);
      } else if (state === 'disconnected') {
        // Coupure transitoire : si ça dure, on renégocie
        setTimeout(() => {
          if (pc.connectionState === 'disconnected') {
            closePeer(peerId, true);
            setTimeout(reconcile, 1000);
          }
        }, 4000);
      } else if (state === 'closed') {
        closePeer(peerId);
      }
    };
    return peer;
  }

  function closePeer(peerId: string, keepStatus = false) {
    peersRef.current.get(peerId)?.pc.close();
    peersRef.current.delete(peerId);
    document.getElementById(`audio-${peerId}`)?.remove();
    if (!keepStatus) {
      setStatus((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    }
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

  // Donne / retire localement la parole et synchronise le miroir.
  function setFloorLocal(peerId: string, granted: boolean) {
    setFloor((prev) => {
      const next = { ...prev, [peerId]: granted };
      floorRef.current = next;
      return next;
    });
  }

  async function handleSignal(sig: Signal) {
    try {
      if (sig.kind === 'hello') {
        // Filet de sécurité si la présence tarde à se synchroniser
        setRoster((r) => ({ ...r, [sig.from]: sig.name }));
        if (!peersRef.current.has(sig.from) && userId < sig.from) {
          await makeOffer(sig.from, sig.name);
        }
        // L'hôte rappelle au nouvel arrivant qui a déjà la parole
        if (isHost) {
          for (const [sid, granted] of Object.entries(floorRef.current)) {
            if (granted) send({ kind: 'floor', from: userId, to: sid, granted: true });
          }
        }
        return;
      }

      if (sig.kind === 'hand') {
        // Tout le monde voit les mains levées (utile surtout à l'hôte)
        setHands((h) => ({ ...h, [sig.from]: sig.raised }));
        setRoster((r) => (r[sig.from] ? r : { ...r, [sig.from]: sig.name }));
        return;
      }

      if (sig.kind === 'floor') {
        setFloorLocal(sig.to, sig.granted);
        if (sig.to === userId) {
          // C'est moi : j'active/coupe mon micro et je baisse la main
          applyMic(isHost || sig.granted, muted);
          if (sig.granted) {
            setHandRaised(false);
            setNeedsUnlock(false);
          }
        }
        if (sig.granted) setHands((h) => ({ ...h, [sig.to]: false }));
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

    // L'hôte parle d'emblée ; l'élève démarre muet (sans la parole).
    applyMic(isHost, false);

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
      setHands((h) => {
        const next = { ...h };
        delete next[key];
        return next;
      });
      setFloorLocal(key, false);
    });

    channel.subscribe(async (subscribeStatus) => {
      if (subscribeStatus === 'SUBSCRIBED') {
        await channel.track({ name: userName });
        send({ kind: 'hello', from: userId, name: userName });
        joinedRef.current = true;
        setJoined(true);
        setConnecting(false);
        reconcile();
      } else if (subscribeStatus === 'CHANNEL_ERROR' || subscribeStatus === 'TIMED_OUT') {
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
    floorRef.current = {};
    setJoined(false);
    setConnecting(false);
    setMuted(false);
    setRoster({});
    setStatus({});
    setNeedsUnlock(false);
    setHands({});
    setFloor({});
    setHandRaised(false);
  }

  function toggleMute() {
    const next = !muted;
    applyMic(iHaveFloor, next);
    setMuted(next);
  }

  // (Élève) lever / baisser la main
  function toggleHand() {
    const next = !handRaised;
    setHandRaised(next);
    send({ kind: 'hand', from: userId, name: userName, raised: next });
  }

  // (Élève) rendre la parole de soi-même
  function releaseFloor() {
    setFloorLocal(userId, false);
    applyMic(false, muted);
    send({ kind: 'floor', from: userId, to: userId, granted: false });
  }

  // (Hôte) donner / retirer la parole à un élève
  function toggleFloor(peerId: string) {
    const granted = !(floor[peerId] === true);
    setFloorLocal(peerId, granted);
    if (granted) setHands((h) => ({ ...h, [peerId]: false }));
    send({ kind: 'floor', from: userId, to: peerId, granted });
  }

  const rosterEntries = Object.entries(roster);
  const raisedCount = Object.values(hands).filter(Boolean).length;

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
          <div className="mb-1 flex items-center justify-between gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
            <span className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative h-3 w-3 rounded-full bg-emerald-600" />
              </span>
              Audio en direct
            </span>
            {isHost && raisedCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <Hand className="h-3.5 w-3.5" /> {raisedCount}
              </span>
            )}
          </div>

          {/* ----------------------------------------------------- */}
          {/* Vue HÔTE : liste des participants avec gestion parole */}
          {/* ----------------------------------------------------- */}
          {isHost ? (
            <div className="mb-2">
              {rosterEntries.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  En attente des élèves…
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {rosterEntries.map(([id, name]) => {
                    const speaking = floor[id] === true;
                    const raised = hands[id] === true;
                    return (
                      <li
                        key={id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-sm dark:bg-slate-700/50"
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          {raised && <Hand className="h-4 w-4 shrink-0 text-amber-500" />}
                          <span className="truncate">{name}</span>
                          <span className="shrink-0">
                            {status[id] === 'connected'
                              ? '✅'
                              : status[id] === 'failed'
                                ? '❌'
                                : '⏳'}
                          </span>
                        </span>
                        <button
                          onClick={() => toggleFloor(id)}
                          className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold active:scale-95 ${
                            speaking
                              ? 'bg-emerald-600 text-white'
                              : raised
                                ? 'bg-amber-500 text-white'
                                : 'border border-slate-300 text-slate-600 dark:border-slate-500 dark:text-slate-200'
                          }`}
                        >
                          <Mic className="h-3.5 w-3.5" />
                          {speaking ? 'Retirer' : 'Donner la parole'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            /* --------------------------------------------------- */
            /* Vue ÉLÈVE : statut + main levée / parole            */
            /* --------------------------------------------------- */
            <>
              <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
                {rosterEntries.length === 0 ? (
                  'En attente du tuteur…'
                ) : (
                  <>
                    {rosterEntries.map(([id, name], i) => (
                      <span key={id}>
                        {i > 0 && ' · '}
                        {name}{' '}
                        {status[id] === 'connected'
                          ? '✅'
                          : status[id] === 'failed'
                            ? '❌ réseau bloqué, nouvel essai…'
                            : '⏳ connexion…'}
                      </span>
                    ))}
                  </>
                )}
              </p>
              {iHaveFloor ? (
                <p className="mb-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  🎤 Tu as la parole — parle !
                </p>
              ) : handRaised ? (
                <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  ✋ Main levée — le tuteur va te donner la parole.
                </p>
              ) : null}
            </>
          )}

          {/* Lecture bloquée par le navigateur (mobile) : un clic suffit */}
          {needsUnlock && (
            <button
              onClick={playAll}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 font-semibold text-white active:scale-95"
            >
              <Volume2 className="h-5 w-5" /> Activer le son 🔊
            </button>
          )}

          <div className="flex gap-2">
            {/* Élève sans la parole : bouton « lever la main » */}
            {!isHost && !iHaveFloor ? (
              <button
                onClick={toggleHand}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold active:scale-95 ${
                  handRaised
                    ? 'bg-amber-500 text-white'
                    : 'border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'
                }`}
              >
                <Hand className="h-4 w-4" />
                {handRaised ? 'Baisser la main' : 'Demander la parole'}
              </button>
            ) : (
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
            )}

            {/* Élève qui a la parole : peut la rendre */}
            {!isHost && iHaveFloor && (
              <button
                onClick={releaseFloor}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 active:scale-95 dark:border-slate-600 dark:text-slate-200"
              >
                <Hand className="h-4 w-4" /> Rendre la parole
              </button>
            )}

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

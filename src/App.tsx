import { useMemo, useState } from 'react';

type Sound = 'Rechteck' | 'Impuls' | 'Sägezahn' | 'Dreieck' | 'Rauschen';
type InputMode = 'chords' | 'audio';

type ToneBlock = {
  id: string;
  label: string;
  type: 'lead' | 'bass' | 'noise' | 'seat';
  note?: string;
  neigung?: number;
  delay?: number;
  duration?: number;
  pause?: number;
  sound?: Sound;
  trigger?: string;
  toggle?: boolean;
  x: number;
  y: number;
};

type NormalizedChord = { 
  root: string; 
  quality: 'maj' | 'min' | 'dom7';
};

const NOTE_TO_SEMITONE: Record<string, number> = { 
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, H: 11 
};
const SEMI_TO_NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHORD_PATTERN = /\[([A-H][b#]?)(m|maj|min|7)?\]/gi;
const LEAD_PATTERNS: [number, number][] = [[0, 2], [4, 2], [0, 4], [2, 0]];

const mod = (value: number, base = 12) => ((value % base) + base) % base;
const stepDelay = (bpm: number) => Number((60 / Math.max(40, bpm) / 2).toFixed(2));
const noteFromNeigung = (n: number) => SEMI_TO_NOTE[mod(n)];

const clampTrailmakersPitch = (value: number) => {
  let adjusted = value;
  while (adjusted < -24) adjusted += 12;
  while (adjusted > 24) adjusted -= 12;
  return adjusted;
};

const chordTones = ({ root, quality }: NormalizedChord): number[] => {
  const base = NOTE_TO_SEMITONE[root];
  return quality === 'min' ? [base, mod(base + 3), mod(base + 7)] : [base, mod(base + 4), mod(base + 7)];
};

const detectDominantNote = (samples: Float32Array, sampleRate: number): number | null => {
  if (samples.length < 2) return null;
  let crossings = 0;
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i - 1] <= 0 && samples[i] > 0) crossings += 1;
  }
  const freq = crossings / Math.max(samples.length / sampleRate, 0.001);
  if (!Number.isFinite(freq) || freq < 50 || freq > 1200) return null;
  return mod(Math.round(69 + 12 * Math.log2(freq / 440)));
};

export default function App() {
  const [mode, setMode] = useState<InputMode>('chords');
  const [input, setInput] = useState('[C] test [Am] test [F] test [G] test');
  const [bpm, setBpm] = useState(120);
  const [leadCount, setLeadCount] = useState(8);
  const [includeBass, setIncludeBass] = useState(true);
  const [includeNoise, setIncludeNoise] = useState(false);
  const [leadSound, setLeadSound] = useState<Sound>('Rechteck');
  const [bassSound, setBassSound] = useState<Sound>('Dreieck');
  const [octShift, setOctShift] = useState(0);
  const [durMult, setDurMult] = useState(1);
  const [blocks, setBlocks] = useState<ToneBlock[]>([]);
  const [selected, setSelected] = useState<ToneBlock | null>(null);
  const [status, setStatus] = useState('');

  const buildBlocks = (chords: NormalizedChord[]) => {
    if (!chords.length) return;
    const generated: ToneBlock[] = [];
    const d = stepDelay(bpm);

    for (let i = 0; i < leadCount; i += 1) {
      const tones = chordTones(chords[i % chords.length]);
      const pair = LEAD_PATTERNS[Math.floor(i / 2) % LEAD_PATTERNS.length];
      const toneIndex = i % 2 === 0 ? pair[0] : pair[1];
      const neigung = clampTrailmakersPitch(tones[toneIndex % 3] + octShift);
      generated.push({
        id: `lead-${i + 1}`,
        label: `L${i + 1}`,
        type: 'lead',
        note: noteFromNeigung(neigung),
        neigung,
        delay: Number((i * d).toFixed(2)),
        duration: Number((0.2 * durMult).toFixed(2)),
        pause: 0,
        sound: leadSound,
        trigger: 'Ein-/Ausschalten',
        toggle: false,
        x: i % 8,
        y: Math.floor(i / 8),
      });
    }

    if (includeBass) {
      chords.forEach((chord, i) => {
        const neigung = clampTrailmakersPitch(NOTE_TO_SEMITONE[chord.root] - 12 + octShift);
        generated.push({
          id: `bass-${i + 1}`,
          label: `B${i + 1}`,
          type: 'bass',
          note: noteFromNeigung(neigung),
          neigung,
          delay: Number((i * d * 2).toFixed(2)),
          duration: Number((0.45 * durMult).toFixed(2)),
          pause: 0,
          sound: bassSound,
          trigger: 'Ein-/Ausschalten',
          toggle: false,
          x: i % 8,
          y: Math.floor(leadCount / 8) + 1 + Math.floor(i / 8),
        });
      });
    }

    if (includeNoise) {
      for (let i = 0; i < leadCount; i += 1) {
        generated.push({
          id: `noise-${i + 1}`,
          label: `N${i + 1}`,
          type: 'noise',
          neigung: 0,
          delay: Number((i * d).toFixed(2)),
          duration: Number((0.04 * durMult).toFixed(2)),
          pause: 0,
          sound: 'Rauschen',
          trigger: 'Ein-/Ausschalten',
          toggle: false,
          x: i % 8,
          y: Math.floor(leadCount / 8) + 2 + (includeBass ? Math.ceil(chords.length / 8) : 0) + Math.floor(i / 8),
        });
      }
    }

    generated.push({
      id: 'seat-1',
      label: 'Seat',
      type: 'seat',
      x: 0,
      y: Math.max(...generated.map((g) => g.y)) + 1,
    });

    setBlocks(generated);
    setSelected(generated[0] ?? null);
  };

  const parseChordInput = (text: string): NormalizedChord[] => {
    const chords: NormalizedChord[] = [];
    for (const match of text.matchAll(CHORD_PATTERN)) {
      const rootRaw = (match[1] ?? '').replace('H', 'B');
      const qualityRaw = (match[2] ?? '').toLowerCase();
      const root = rootRaw[0].toUpperCase() + (rootRaw[1] ?? '');
      if (!(root in NOTE_TO_SEMITONE)) continue;
      const quality: NormalizedChord['quality'] =
        qualityRaw === 'm' || qualityRaw === 'min' ? 'min' : qualityRaw === '7' ? 'dom7' : 'maj';
      chords.push({ root, quality });
    }
    return chords;
  };

  const generateFromText = () => {
    const chords = parseChordInput(input);
    if (!chords.length) return setStatus('Keine Akkorde erkannt. Nutze z.B. [C] [Am] [F] [G].');
    setStatus(`Erkannt: ${chords.length} Akkorde.`);
    buildBlocks(chords);
  };

  const onChordFileUpload = async (file: File) => {
    const text = await file.text();
    setInput(text);
    const chords = parseChordInput(text);
    if (!chords.length) return setStatus(`Datei geladen (${file.name}), aber keine Akkorde gefunden.`);
    setStatus(`Chord-Datei geladen: ${file.name} (${chords.length} Akkorde).`);
    buildBlocks(chords);
  };

  const onAudioUpload = async (file: File) => {
    try {
      setStatus('Analysiere Audio Datei...');
      const arrayBuffer = await file.arrayBuffer();
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await context.decodeAudioData(arrayBuffer);
      const channel = audioBuffer.getChannelData(0);
      const segmentLength = Math.max(1, Math.floor(channel.length / leadCount));
      const roots: string[] = [];
      
      for (let i = 0; i < leadCount; i += 1) {
        const slice = channel.slice(i * segmentLength, Math.min(channel.length, (i + 1) * segmentLength));
        const detected = detectDominantNote(slice, audioBuffer.sampleRate);
        roots.push(noteFromNeigung(detected ?? (i % 2 === 0 ? 0 : 7)));
      }
      
      await context.close();
      buildBlocks(roots.map((root) => ({ root, quality: 'maj' })));
      setStatus(`Audio geladen: ${file.name}. Vereinfachte Akkorde wurden erzeugt.`);
    } catch {
      setStatus('Audio konnte nicht decodiert werden.');
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Trailmakers Song Builder</h1>
      {/* Dein UI Layout kommt hier hin */}
      <p>Status: {status}</p>
    </div>
  );
}
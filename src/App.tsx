import { useMemo, useState } from 'react';

type Sound = 'Rechteck' | 'Impuls' | 'Sägezahn' | 'Dreieck' | 'Rauschen';
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

type NormalizedChord = { root: string; quality: 'maj' | 'min' | 'dom7' };

const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, H: 11,
};
const SEMI_TO_NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const chordPattern = /\[([A-H][b#]?)(m|maj|min|7)?\]/gi;
const leadPatterns: [number, number][] = [[0, 2], [4, 2], [0, 4], [2, 0]];
const TM_MIN = -24;
const TM_MAX = 24;

const stepDelay = (bpm: number) => Number((60 / Math.max(40, bpm) / 2).toFixed(2));
const mod = (n: number, m = 12) => ((n % m) + m) % m;

const fitToTrailmakersRange = (value: number): number => {
  let adjusted = value;
  while (adjusted < TM_MIN) adjusted += 12;
  while (adjusted > TM_MAX) adjusted -= 12;
  return Math.max(TM_MIN, Math.min(TM_MAX, adjusted));
};

const chordTones = ({ root, quality }: NormalizedChord): number[] => {
  const base = NOTE_TO_SEMITONE[root];
  if (quality === 'min') return [base, mod(base + 3), mod(base + 7)];
  return [base, mod(base + 4), mod(base + 7)];
};

const noteFromNeigung = (neigung: number): string => SEMI_TO_NOTE[mod(neigung)];

const detectDominantNote = (samples: Float32Array, sampleRate: number): number | null => {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1] <= 0 && samples[i] > 0) crossings++;
  }
  const durationSec = samples.length / sampleRate;
  const freq = crossings / Math.max(durationSec, 0.001);
  if (!Number.isFinite(freq) || freq < 50 || freq > 1200) return null;
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  return mod(midi, 12);
};

function App() {
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
  const [audioStatus, setAudioStatus] = useState('');

  const buildFromChords = (chords: NormalizedChord[]) => {
    const generated: ToneBlock[] = [];
    const d = stepDelay(bpm);

    for (let i = 0; i < leadCount; i++) {
      const chord = chords[i % chords.length];
      const tones = chordTones(chord);
      const pair = leadPatterns[Math.floor(i / 2) % leadPatterns.length];
      const toneIdx = i % 2 === 0 ? pair[0] : pair[1];
      const rawNeigung = tones[toneIdx % 3] + octShift;
      const neigung = fitToTrailmakersRange(rawNeigung);
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
      chords.forEach((ch, i) => {
        const neigung = fitToTrailmakersRange(NOTE_TO_SEMITONE[ch.root] - 12 + octShift);
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
      for (let i = 0; i < leadCount; i++) {
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

    generated.push({ id: 'seat-1', label: 'Seat', type: 'seat', x: 0, y: Math.max(...generated.map((g) => g.y)) + 1 });
    setBlocks(generated);
    setSelected(generated[0]);
  };

  const generate = () => {
    const chords: NormalizedChord[] = [];
    for (const match of input.matchAll(chordPattern)) {
      const rawRoot = (match[1] ?? '').replace('H', 'B');
      const qualityRaw = (match[2] ?? '').toLowerCase();
      const root = rawRoot[0].toUpperCase() + (rawRoot[1] ?? '');
      if (!(root in NOTE_TO_SEMITONE)) continue;
      const quality: NormalizedChord['quality'] = qualityRaw === 'm' || qualityRaw === 'min' ? 'min' : qualityRaw === '7' ? 'dom7' : 'maj';
      chords.push({ root, quality });
    }
    if (!chords.length) return;
    buildFromChords(chords);
  };

  const onAudioUpload = async (file: File) => {
    try {
      setAudioStatus('Analysiere MP3 ...');
      const arr = await file.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arr);
      const channel = audioBuffer.getChannelData(0);
      const segmentLength = Math.floor(channel.length / Math.max(leadCount, 1));
      const notes: number[] = [];
      for (let i = 0; i < leadCount; i++) {
        const start = i * segmentLength;
        const end = Math.min(channel.length, start + segmentLength);
        const slice = channel.slice(start, end);
        const n = detectDominantNote(slice, audioBuffer.sampleRate);
        notes.push(n ?? (i % 2 === 0 ? 0 : 7));
      }
      const chords = notes.map((n) => ({ root: noteFromNeigung(n), quality: 'maj' as const }));
      buildFromChords(chords);
      setAudioStatus(`MP3 analysiert: ${file.name}`);
      audioContext.close();
    } catch {
      setAudioStatus('MP3 konnte nicht analysiert werden. Bitte andere Datei testen.');
    }
  };

  const settingsText = useMemo(() => blocks.filter((b) => b.type !== 'seat').map((b) =>
    `${b.label}: Neigung ${b.neigung ?? 0}, Verzögerung ${b.delay?.toFixed(2) ?? '0.00'}, Dauer ${b.duration?.toFixed(2) ?? '0.00'}, Pause ${b.pause?.toFixed(1) ?? '0.0'}, Sound ${b.sound ?? '-'}`,
  ).join('\n'), [blocks]);

  return (
    <div className="min-h-screen p-4">
      <h1 className="mb-4 text-2xl font-bold text-cyan-300">Trailmakers Song Builder</h1>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="space-y-3 rounded bg-slate-900 p-4">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} className="h-40 w-full rounded bg-slate-800 p-2" />
          <label className="block text-sm">MP3 Upload (Browser Decode)
            <input type="file" accept="audio/*" className="mt-1 w-full text-sm" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onAudioUpload(file);
            }} />
          </label>
          {audioStatus ? <p className="text-xs text-cyan-300">{audioStatus}</p> : null}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label>BPM <input type="number" className="w-full rounded bg-slate-800 p-1" value={bpm} onChange={(e) => setBpm(Number(e.target.value) || 120)} /></label>
            <label>Lead Blöcke
              <select className="w-full rounded bg-slate-800 p-1" value={leadCount} onChange={(e) => setLeadCount(Number(e.target.value))}>
                {[8, 16, 32].map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
            <label>Lead Sound
              <select className="w-full rounded bg-slate-800 p-1" value={leadSound} onChange={(e) => setLeadSound(e.target.value as Sound)}>
                {['Rechteck', 'Impuls', 'Sägezahn', 'Dreieck', 'Rauschen'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>Bass Sound
              <select className="w-full rounded bg-slate-800 p-1" value={bassSound} onChange={(e) => setBassSound(e.target.value as Sound)}>
                {['Rechteck', 'Impuls', 'Sägezahn', 'Dreieck', 'Rauschen'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>Oktav Shift
              <select className="w-full rounded bg-slate-800 p-1" value={octShift} onChange={(e) => setOctShift(Number(e.target.value))}>
                {[-24, -12, 0, 12, 24].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>Dauer x <input type="number" step="0.1" className="w-full rounded bg-slate-800 p-1" value={durMult} onChange={(e) => setDurMult(Number(e.target.value) || 1)} /></label>
          </div>
          <label className="block"><input type="checkbox" checked={includeBass} onChange={(e) => setIncludeBass(e.target.checked)} /> Bass</label>
          <label className="block"><input type="checkbox" checked={includeNoise} onChange={(e) => setIncludeNoise(e.target.checked)} /> Noise</label>
          <button onClick={generate} className="rounded bg-cyan-700 px-4 py-2">Generate Trailmakers Song</button>
          <div className="flex gap-2">
            <button className="rounded bg-slate-700 px-3 py-1" onClick={() => navigator.clipboard.writeText(settingsText)}>Copy Settings</button>
            <button className="rounded bg-slate-700 px-3 py-1" onClick={() => {
              const blob = new Blob([JSON.stringify(blocks, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'trailmakers-song.json';
              a.click();
              URL.revokeObjectURL(a.href);
            }}>Export JSON</button>
          </div>
        </section>

        <section className="rounded bg-slate-900 p-4"><h2 className="mb-2 font-semibold">2D Blockplan (Front = oben)</h2><div className="grid grid-cols-8 gap-2">{blocks.map((b) => (<button key={b.id} onClick={() => setSelected(b)} className={`rounded p-2 text-xs ${selected?.id === b.id ? 'bg-cyan-700' : 'bg-slate-800'}`}>{b.label}<br />({b.x},{b.y})</button>))}</div></section>

        <section className="rounded bg-slate-900 p-4">
          <h2 className="mb-2 font-semibold">Block Einstellungen</h2>
          {selected ? <div className="space-y-1 text-sm"><div>Block: {selected.label}</div><div>Note: {selected.note ?? '-'}</div><div>Neigung: {selected.neigung ?? '-'}</div><div>Verzögerung: {selected.delay?.toFixed(2) ?? '-'}</div><div>Dauer: {selected.duration?.toFixed(2) ?? '-'}</div><div>Pause: {selected.pause?.toFixed(1) ?? '-'}</div><div>Sound: {selected.sound ?? '-'}</div><div>Trigger: {selected.trigger ?? '-'}</div><div>Umschalten: {selected.toggle ? 'on' : 'off'}</div></div> : <div>Nichts gewählt.</div>}
        </section>
      </div>
      <section className="mt-4 rounded bg-slate-900 p-4"><h2 className="mb-2 font-semibold">Ausgabe</h2><pre className="whitespace-pre-wrap text-xs">{settingsText}</pre></section>
    </div>
  );
}

export default App;

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

type NormalizedChord = { root: string; quality: 'maj' | 'min' | 'dom7' };

const NOTE_TO_SEMITONE: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, H: 11 };
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
  for (let i = 1; i < samples.length; i += 1) if (samples[i - 1] <= 0 && samples[i] > 0) crossings += 1;
  const freq = crossings / Math.max(samples.length / sampleRate, 0.001);
  if (!Number.isFinite(freq) || freq < 50 || freq > 1200) return null;
  return mod(Math.round(69 + 12 * Math.log2(freq / 440)));
};

function App() {
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
    const generated: ToneBlock[] = [];
    const d = stepDelay(bpm);
    for (let i = 0; i < leadCount; i += 1) {
      const tones = chordTones(chords[i % chords.length]);
      const pair = LEAD_PATTERNS[Math.floor(i / 2) % LEAD_PATTERNS.length];
      const toneIndex = i % 2 === 0 ? pair[0] : pair[1];
      const neigung = clampTrailmakersPitch(tones[toneIndex % 3] + octShift);
      generated.push({ id: `lead-${i + 1}`, label: `L${i + 1}`, type: 'lead', note: noteFromNeigung(neigung), neigung, delay: Number((i * d).toFixed(2)), duration: Number((0.2 * durMult).toFixed(2)), pause: 0, sound: leadSound, trigger: 'Ein-/Ausschalten', toggle: false, x: i % 8, y: Math.floor(i / 8) });
    }

    if (includeBass) chords.forEach((chord, i) => {
      const neigung = clampTrailmakersPitch(NOTE_TO_SEMITONE[chord.root] - 12 + octShift);
      generated.push({ id: `bass-${i + 1}`, label: `B${i + 1}`, type: 'bass', note: noteFromNeigung(neigung), neigung, delay: Number((i * d * 2).toFixed(2)), duration: Number((0.45 * durMult).toFixed(2)), pause: 0, sound: bassSound, trigger: 'Ein-/Ausschalten', toggle: false, x: i % 8, y: Math.floor(leadCount / 8) + 1 + Math.floor(i / 8) });
    });

    if (includeNoise) for (let i = 0; i < leadCount; i += 1) generated.push({ id: `noise-${i + 1}`, label: `N${i + 1}`, type: 'noise', neigung: 0, delay: Number((i * d).toFixed(2)), duration: Number((0.04 * durMult).toFixed(2)), pause: 0, sound: 'Rauschen', trigger: 'Ein-/Ausschalten', toggle: false, x: i % 8, y: Math.floor(leadCount / 8) + 2 + (includeBass ? Math.ceil(chords.length / 8) : 0) + Math.floor(i / 8) });

    generated.push({ id: 'seat-1', label: 'Seat', type: 'seat', x: 0, y: Math.max(...generated.map((g) => g.y)) + 1 });
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
      const quality: NormalizedChord['quality'] = qualityRaw === 'm' || qualityRaw === 'min' ? 'min' : qualityRaw === '7' ? 'dom7' : 'maj';
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
      const context = new AudioContext();
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
      setStatus('Audio konnte nicht decodiert werden. Bitte MP3/WAV testen.');
    }
  };

  const settingsText = useMemo(() => blocks.filter((b) => b.type !== 'seat').map((b) => `${b.label}: Neigung ${b.neigung ?? 0}, Verzögerung ${b.delay?.toFixed(2) ?? '0.00'}, Dauer ${b.duration?.toFixed(2) ?? '0.00'}, Pause ${b.pause?.toFixed(1) ?? '0.0'}, Sound ${b.sound ?? '-'}`).join('\n'), [blocks]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-cyan-950/40 p-4 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between rounded-xl border border-cyan-500/30 bg-slate-900/70 p-4">
          <h1 className="text-2xl font-bold text-cyan-300">Trailmakers Song Builder</h1>
          <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs">React + Vite</span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/80 p-4 shadow-xl">
            <div className="flex gap-2">
              <button onClick={() => setMode('chords')} className={`rounded px-3 py-1 text-sm ${mode === 'chords' ? 'bg-cyan-600' : 'bg-slate-700'}`}>Chord Text</button>
              <button onClick={() => setMode('audio')} className={`rounded px-3 py-1 text-sm ${mode === 'audio' ? 'bg-cyan-600' : 'bg-slate-700'}`}>Audio Upload</button>
            </div>

            <textarea value={input} onChange={(e) => setInput(e.target.value)} className="h-40 w-full rounded border border-slate-700 bg-slate-800 p-2" />

            <label className="block text-sm">Song/Chord Datei hochladen (.txt/.md)
              <input type="file" accept=".txt,.md,.chord,text/plain" className="mt-1 w-full text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onChordFileUpload(f); }} />
            </label>

            {mode === 'audio' ? <label className="block text-sm">Audio hochladen (MP3/WAV)
              <input type="file" accept="audio/mpeg,audio/wav,audio/*" className="mt-1 w-full text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onAudioUpload(f); }} />
            </label> : null}

            {status ? <p className="rounded bg-cyan-900/40 p-2 text-xs text-cyan-100">{status}</p> : null}

            <div className="grid grid-cols-2 gap-2 text-sm">
              <label>BPM<input type="number" className="w-full rounded bg-slate-800 p-1" value={bpm} onChange={(e) => setBpm(Number(e.target.value) || 120)} /></label>
              <label>Lead Blöcke<select className="w-full rounded bg-slate-800 p-1" value={leadCount} onChange={(e) => setLeadCount(Number(e.target.value))}>{[8, 16, 32].map((n) => <option key={n}>{n}</option>)}</select></label>
              <label>Lead Sound<select className="w-full rounded bg-slate-800 p-1" value={leadSound} onChange={(e) => setLeadSound(e.target.value as Sound)}>{['Rechteck', 'Impuls', 'Sägezahn', 'Dreieck', 'Rauschen'].map((s) => <option key={s}>{s}</option>)}</select></label>
              <label>Bass Sound<select className="w-full rounded bg-slate-800 p-1" value={bassSound} onChange={(e) => setBassSound(e.target.value as Sound)}>{['Rechteck', 'Impuls', 'Sägezahn', 'Dreieck', 'Rauschen'].map((s) => <option key={s}>{s}</option>)}</select></label>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <label>Oktav Shift<select className="w-full rounded bg-slate-800 p-1" value={octShift} onChange={(e) => setOctShift(Number(e.target.value))}>{[-24, -12, 0, 12, 24].map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
              <label>Dauer x<input type="number" step="0.1" className="w-full rounded bg-slate-800 p-1" value={durMult} onChange={(e) => setDurMult(Number(e.target.value) || 1)} /></label>
            </div>

            <div className="flex gap-4 text-sm">
              <label><input type="checkbox" checked={includeBass} onChange={(e) => setIncludeBass(e.target.checked)} /> Bass</label>
              <label><input type="checkbox" checked={includeNoise} onChange={(e) => setIncludeNoise(e.target.checked)} /> Noise</label>
            </div>

            <button onClick={generateFromText} className="w-full rounded bg-cyan-700 py-2 font-semibold hover:bg-cyan-600">Generate Trailmakers Song</button>
            <div className="flex gap-2">
              <button className="rounded bg-slate-700 px-3 py-1" onClick={() => navigator.clipboard.writeText(settingsText)}>Copy Settings</button>
              <button className="rounded bg-slate-700 px-3 py-1" onClick={() => {
                const blob = new Blob([JSON.stringify(blocks, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob); a.download = 'trailmakers-song.json'; a.click(); URL.revokeObjectURL(a.href);
              }}>Export JSON</button>
            </div>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-900/80 p-4 shadow-xl">
            <h2 className="mb-2 font-semibold">2D Blockplan (Front = oben)</h2>
            <div className="grid grid-cols-8 gap-2">{blocks.map((b) => <button key={b.id} onClick={() => setSelected(b)} className={`rounded p-2 text-xs ${selected?.id === b.id ? 'bg-cyan-700' : 'bg-slate-800 hover:bg-slate-700'}`}>{b.label}<br />({b.x},{b.y})</button>)}</div>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-900/80 p-4 shadow-xl">
            <h2 className="mb-2 font-semibold">Block Einstellungen</h2>
            {selected ? <div className="space-y-2 text-sm"><div>Block: <b>{selected.label}</b></div><div>Note: {selected.note ?? '-'}</div><div>Neigung: {selected.neigung ?? '-'}</div><div>Verzögerung: {selected.delay?.toFixed(2) ?? '-'}</div><div>Dauer: {selected.duration?.toFixed(2) ?? '-'}</div><div>Pause: {selected.pause?.toFixed(1) ?? '-'}</div><div>Sound: {selected.sound ?? '-'}</div><div>Trigger: {selected.trigger ?? '-'}</div><div>Umschalten: {selected.toggle ? 'on' : 'off'}</div></div> : <div>Nichts gewählt.</div>}
          </section>
        </div>

        <section className="mt-4 rounded-xl border border-slate-700 bg-slate-900/80 p-4 shadow-xl">
          <h2 className="mb-2 font-semibold">Ausgabe</h2>
          <pre className="whitespace-pre-wrap text-xs">{settingsText}</pre>
        </section>
      </div>
    </div>
  );
}

export default App;

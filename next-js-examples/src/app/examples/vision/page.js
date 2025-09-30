'use client'
import React, { useEffect, useRef, useState } from "react";

export default function ImageEmotionPage() {
  // const speechRef = useRef(null);

  // UI state
  const [uploadedImage, setUploadedImage] = useState(null);
  const [promptText, setPromptText] = useState('Describe the emotions of this image.');
  const [loading, setLoading] = useState(false);
  const [copiedInterp, setCopiedInterp] = useState(false);

  // Diagnostics
  const [errorMsg, setErrorMsg] = useState('');
  const [lastStatus, setLastStatus] = useState(null);
  const [lastRawContent, setLastRawContent] = useState('');

  // Model response state
  const [gptResponse, setGptResponse] = useState(''); // raw string from LLM
  const [messages, setMessages] = useState([]);        // [{request, response}]
  const [showDialog, setShowDialog] = useState(false);

  // Music mapping state
  const [musicParams, setMusicParams] = useState(null);
  const [magentaCLI, setMagentaCLI] = useState('');

  // Copy-to-clipboard state
const [copiedJSON, setCopiedJSON] = useState(false);
const [copiedCLI, setCopiedCLI] = useState(false);
const [primerSpec, setPrimerSpec] = useState(null);
const [copiedPrimer, setCopiedPrimer] = useState(false);

// Copy-to-clipboard helper
async function copyText(text, setFlag) {
  try {
    await navigator.clipboard.writeText(text);
    setFlag(true);
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setFlag(true);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  } finally {
    // show “Copied!” briefly
    setTimeout(() => setFlag(false), 1200);
  }
}

// Generate and play music states
const [audioUrl, setAudioUrl] = useState('');
const [genBusy, setGenBusy] = useState(false);
const [genError, setGenError] = useState('');

const generateAndPlay = async () => {
  setGenError('');
  try {
    if (!primerSpec) {
      setGenError('No primer available. Analyze an image first.');
      return;
    }
    setGenBusy(true);

    const payload = {
      primer_melody: primerSpec.primer_melody,
      num_steps: primerSpec.num_steps,
      config: primerSpec.config || 'attention_rnn',
      qpm: (musicParams && musicParams.tempo) ? musicParams.tempo : 120
    };

    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    setAudioUrl(data.url || '');
  } catch (e) {
    setGenError(String(e.message || e));
  } finally {
    setGenBusy(false);
  }
};


  // Parsers & effects
  useEffect(() => {
    if (!gptResponse) return;
    try {
      const i = gptResponse.indexOf('{');
      const jsonStr = i >= 0 ? gptResponse.slice(i) : gptResponse;
      const json = JSON.parse(jsonStr);

      if (json && json.request && json.response) {
        setMessages(prev => [...prev, { request: json.request, response: json.response }]);
        // if (speechRef.current) speechRef.current.play(json.response); // TTS optional
        setErrorMsg('');
      } else {
        setErrorMsg('Model did not return expected JSON fields {request, response}.');
      }
    } catch (e) {
      console.error('JSON parse error:', e, gptResponse);
      setErrorMsg('Failed to parse JSON from model response.');
    }
  }, [gptResponse]);

  useEffect(() => {
    setShowDialog(messages.length > 0 && !!(messages[messages.length - 1] || {}).response);
  }, [messages]);

  // Image features helpers
  function dataURLToImage(dataURL) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.src = dataURL;
    });
  }

  async function extractImageFeatures(dataURL) {
    const img = await dataURLToImage(dataURL);
    const W = 256, H = 256;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);

    let sumS = 0, sumL = 0, sumHsin = 0, sumHcos = 0;
    let edges = 0, total = (W-2)*(H-2);
    let darkCount = 0;
    let leftLum = 0, rightLum = 0, topLum = 0, bottomLum = 0;

    const lumAt = (x,y) => {
      const i = (y*W + x)*4, r=data[i], g=data[i+1], b=data[i+2];
      return 0.2126*r + 0.7152*g + 0.0722*b;
    };

    const rgbToHsl = (r,g,b) => {
      r/=255; g/=255; b/=255;
      const max=Math.max(r,g,b), min=Math.min(r,g,b);
      let h=0, s=0, l=(max+min)/2, d=max-min;
      if (d!==0){
        s = d/(1-Math.abs(2*l-1));
        switch(max){
          case r: h=60*(((g-b)/d)%6); break;
          case g: h=60*(((b-r)/d)+2); break;
          case b: h=60*(((r-g)/d)+4); break;
        }
      }
      return {h:(h+360)%360, s, l};
    };

    for (let y=1; y<H-1; y++){
      for (let x=1; x<W-1; x++){
        const i=(y*W+x)*4, r=data[i], g=data[i+1], b=data[i+2];
        const {h,s,l}=rgbToHsl(r,g,b);
        sumS+=s; sumL+=l;
        sumHsin += Math.sin(h*Math.PI/180);
        sumHcos += Math.cos(h*Math.PI/180);
        const gx = lumAt(x+1,y)-lumAt(x-1,y);
        const gy = lumAt(x,y+1)-lumAt(x,y-1);
        if (Math.hypot(gx,gy)>60) edges++;
        const lum = lumAt(x,y);
        if (lum < 60) darkCount++;

        // composition proxies (balance/proportion)
        if (x < W/2) leftLum += lum; else rightLum += lum;
        if (y < H/2) topLum += lum; else bottomLum += lum;
      }
    }

    const avgSat = sumS/total;
    const avgLight = sumL/total;
    const avgHue = (Math.atan2(sumHsin, sumHcos)*180/Math.PI + 360) % 360;

    // normalized simple metrics (0..1)
    const edgeDensity = edges/total;                  // texture/detail
    const shadowness = darkCount/total;               // shadows/contrast-ish
    const balanceLR = Math.abs(leftLum - rightLum) / (leftLum + rightLum + 1e-6);
    const balanceTB = Math.abs(topLum - bottomLum) / (topLum + bottomLum + 1e-6);
    const imbalance = Math.min(1, (balanceLR + balanceTB)/2); // composition balance proxy

    return { avgHue, avgSat, avgLight, edgeDensity, shadowness, imbalance };
  }

  // Affect + mapping helpers
  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
  function inRange(h,a,b){ a=(a+360)%360; b=(b+360)%360; h=(h+360)%360; return a<b ? (h>=a&&h<b) : (h>=a||h<b); }

  function featuresToAffect({avgHue, avgSat, avgLight, edgeDensity, shadowness, imbalance}) {
    const warmScore = (inRange(avgHue, -30, 60) || inRange(avgHue, 330, 390)) ? 1
                     : inRange(avgHue, 60,150) ? 0.2
                     : inRange(avgHue,150,255) ? -1
                     : -0.2;
    const valence = clamp(0.55*avgLight + 0.35*avgSat + 0.10*(0.5+0.5*warmScore), 0, 1);
    const arousal = clamp(0.4*edgeDensity + 0.25*shadowness + 0.2*avgSat + 0.15*imbalance, 0, 1);
    return { valence, arousal, avgHue };
  }

  function hueToKey(h) {
    const KEYS = ["C","G","D","A","E","B","F#","C#","G#","D#","A#","F"];
    return KEYS[Math.floor((h/360)*KEYS.length)%KEYS.length];
  }

  function chordPalette(mode, valence) {
    if (mode === 'major') return valence>0.75 ? ["I","V","vi","IV"] : ["I","vi","IV","V"];
    return valence<0.25 ? ["i","VI","III","VII"] : ["i","iv","VI","v"];
  }

  function mapToMusicParams(affect, features) {
    const mode = affect.valence >= 0.55 ? 'major' : 'minor';
    const key = hueToKey(affect.avgHue);
    const tempo = Math.round(70 + affect.arousal*90); // 70–160
    const density = Math.max(2, Math.round(2 + affect.arousal*6)); // 2–8
    const articulation = affect.arousal > 0.65 ? 'staccato' : (affect.arousal < 0.35 ? 'legato' : 'mixed');
    const chords = chordPalette(mode, affect.valence);

    let instrumentation = [];
    if (mode==='major') instrumentation.push('piano','strings pad');
    else instrumentation.push('electric piano','soft pad');
    if (features.edgeDensity > 0.25) instrumentation.push('light percussion');
    if (affect.arousal > 0.6) instrumentation.push('pluck/synth lead');

    return { key, mode, tempo, density, articulation, chords, instrumentation };
  }

  // Primer (exactly 8 bars, 4/4) helper
  function keyToMidiRoot(key, octave=4) {
    const map = {C:0,"C#":1,"D":2,"D#":3,"E":4,"F":5,"F#":6,"G":7,"G#":8,"A":9,"A#":10,"B":11};
    return 12*(octave+1) + map[key]; // C4=60
  }

  // Scales & roman numerals
function majorScaleSemis() { return [0,2,4,5,7,9,11]; }
function naturalMinorSemis(){ return [0,2,3,5,7,8,10]; }

function degreeFromRoman(roman){
  // returns 0..6 (I..VII). works for upper/lower-case, with/without accidentals
  const base = roman.replace(/[^ivxIVX]/g,''); // strip non-roman chars
  const map = { i:0, ii:1, iii:2, iv:3, v:4, vi:5, vii:6 };
  return map[base.toLowerCase()] ?? 0;
}

function chordQualityFor(mode, deg){
  // diatonic triad qualities by degree (0..6)
  // MAJOR: I maj, ii min, iii min, IV maj, V maj, vi min, vii dim
  // MINOR (natural): i min, ii dim, III maj, iv min, v min, VI maj, VII maj
  if (mode === 'major') {
    return ['maj','min','min','maj','maj','min','dim'][deg];
  } else {
    return ['min','dim','maj','min','min','maj','maj'][deg];
  }
}

function triadIntervals(quality){
  // semitone offsets from chord root
  if (quality === 'maj') return [0, 4, 7];
  if (quality === 'min') return [0, 3, 7];
  // treat dim as minor triad for primer simplicity
  return [0, 3, 6];
}

function scaleRootMidi(key, mode){
  // same as your keyToMidiRoot but returns C4.. etc.
  const map = {C:0,"C#":1,"D":2,"D#":3,"E":4,"F":5,"F#":6,"G":7,"G#":8,"A":9,"A#":10,"B":11};
  return 12*(4+1) + map[key]; // C4 = 60 (octave=4)
}

function chordRootForRoman(key, mode, roman){
  const deg = degreeFromRoman(roman);
  const scale = (mode === 'major') ? majorScaleSemis() : naturalMinorSemis();
  return scaleRootMidi(key, mode) + scale[deg];
}

// Build an 8-bar primer in 4/4
// - key, mode: from musicParams
// - chords: array like ["I","vi","IV","V"] (will repeat to fill 8 bars)
// - density: 2..8  (low = sparse, high = busy)
// - articulation: "staccato" | "legato" | "mixed"  (optional; inserts rests on staccato)
function buildEightBarPrimerUsingParams({ key, mode, chords, density, articulation = 'mixed' }) {
  const BARS = 8, BEATS = 4; // 4/4 → 4 quarter notes per bar
  // choose a pattern family by density bucket
  const dens = Math.max(2, Math.min(8, density || 4));
  const bucket = (dens <= 3) ? 'low' : (dens <= 5) ? 'mid' : 'high';
  const useRests = articulation === 'staccato'; // Magenta primer_melody supports -1 as rest

  // per-bar pattern makers (given chord triad [r,3,5] & root octave +12)
  const makePattern = (triad) => {
    const r = triad[0], third = triad[1], fifth = triad[2], oct = r + 12;
    if (bucket === 'low')   return [r, useRests ? -1 : r, fifth, useRests ? -1 : r];
    if (bucket === 'mid')   return [r, fifth, third, oct];                  // 1–5–3–8
    /* high */              return [r, third, fifth, oct];                  // 1–3–5–8
  };

  const melody = [];
  for (let b = 0; b < BARS; b++) {
    // pick chord for this bar (repeat chord list if < 8)
    const roman = chords && chords.length ? chords[b % chords.length] : (mode === 'major' ? 'I' : 'i');
    const chordRoot = chordRootForRoman(key, mode, roman);
    const qual = chordQualityFor(mode, degreeFromRoman(roman));
    const triad = triadIntervals(qual).map(semi => chordRoot + semi); // [root, third, fifth]

    // small variation: flip order every other bar for a bit of movement
    const base = makePattern(triad);
    const pat = (b % 2 === 1) ? [base[2], base[0], base[1], base[3]] : base;

    // push exactly 4 quarter-note events for this bar
    for (let q = 0; q < BEATS; q++) melody.push(pat[q % pat.length]);
  }

  return melody; // length 32 (8 bars × 4 beats)
}


  function buildMelodyRnnCLI(params) {
    // steps_per_quarter=4 → 16 steps per 4/4 bar → 128 steps for 8 bars
    // num_steps must be ≥ 128. Add some extra so RNN continues after primer.
    const stepsPerQuarter = 4;
    const primer = buildEightBarPrimerUsingParams({
      key: params.key,
      mode: params.mode,
      chords: params.chords,        // from mapToMusicParams
      density: params.density,
      articulation: params.articulation
    });
    
    const basePrimerSteps = 8 * 4 * stepsPerQuarter; // 128
    const extra = Math.round( (params.density >= 5 ? 96 : 64) + (params.tempo - 70) * 0.5 );
    const numSteps = basePrimerSteps + extra; // ~192–240

    return [
      `melody_rnn_generate`,
      `--config=basic_rnn`,
      `--bundle_file="/path/to/basic_rnn.mag"`,
      `--output_dir="/path/to/output"`,
      `--num_outputs=5`,
      `--steps_per_quarter=${stepsPerQuarter}`,
      `--qpm=${params.tempo}`,
      `--num_steps=${numSteps}`,
      `--primer_melody="[${primer.join(',')}]"`,
    ].join(' ');
  }

  function buildPrimerSpec(params) {
    // same timing assumptions as buildMelodyRnnCLI
    const stepsPerQuarter = 4;                     // 16 steps per bar in 4/4
    const primer = buildEightBarPrimerUsingParams({
      key: params.key,
      mode: params.mode,
      chords: params.chords,        // from mapToMusicParams
      density: params.density,
      articulation: params.articulation
    });
    
    const basePrimerSteps = 8 * 4 * stepsPerQuarter; // 128 steps for 8 bars
    const extra = Math.round((params.density >= 5 ? 96 : 64) + (params.tempo - 70) * 0.5);
    const numSteps = basePrimerSteps + extra;
  
    // EXACT string formatting
    return {
      primer_melody: `[${primer.join(',')}]`,
      num_steps: numSteps,
      config: "attention_rnn",
    };
  }
  
  // image file upload
  const handleImageUpload = (e) => {
    setErrorMsg('');
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      console.log('[UPLOAD] loaded image, size=', String(reader.result || '').length);
      setUploadedImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // LLM call + mapping pipeline
  const analyzeImage = async () => {
    setErrorMsg('');
    setLastStatus(null);
    setLastRawContent('');
    setMusicParams(null);
    setMagentaCLI('');

    if (!uploadedImage) {
      setErrorMsg('Please upload an image first.');
      return;
    }

    const host = process.env.LLM_HOST || 'https://api.openai.com'; 
    const apiKey = process.env.OPENAI_API_KEY;
    if (!host || !apiKey) {
      setErrorMsg('Missing LLM_HOST or OPENAI_API_KEY in .env. Restart dev server after editing.');
      return;
    }

    const isPublicOpenAI = host.includes('openai.com');
    const modelId = (isPublicOpenAI ? '' : 'openai.') + 'gpt-4o-mini'; // change based on model

    const payload = {
      model: modelId,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "You are an API. Respond only with valid JSON that begins with '{'." },
            { type: "text", text:
`Describe the emotions expressed by this image. Return exactly:
{"request":"image emotion analysis","response":"short emotional description (1–2 sentences)"}` },
            { type: "text", text: `User prompt: "${promptText || 'Describe the emotions of this image.'}"` },
            { type: "image_url", image_url: { url: uploadedImage } }
          ]
        }
      ]
    };

    try {
      setLoading(true);
      const url = `${host}/v1/chat/completions`;
      console.log('[FETCH] POST', url, payload);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      setLastStatus(res.status);
      const text = await res.text();
      setLastRawContent(text);

      if (!res.ok) {
        if (res.status === 401 && /team.*model.*access/i.test(text)) {
          setErrorMsg(
            `401 from Cornell gateway: model not allowed for your team. ` +
            `Use an allowed model id (check ${host}/v1/models). Details: ${text}`
          );
        } else {
          setErrorMsg(`HTTP ${res.status}: ${text}`);
        }
        return;
      }

      const data = JSON.parse(text);
      const content = (((data || {}).choices || [])[0] || {}).message?.content || '';
      if (!content) {
        setErrorMsg('No content in model response.');
      } else {
        setGptResponse(content);

        //local mapping → music spec + 8-bar primer + CLI
        const feats = await extractImageFeatures(uploadedImage);
        const affect = featuresToAffect(feats);
        const params = mapToMusicParams(affect, feats);
        const cli = buildMelodyRnnCLI(params);

        setMusicParams({ ...params, affect, features: feats });
        setMagentaCLI(cli);
        const spec = buildPrimerSpec(params);
setPrimerSpec(spec);

      }
    } catch (err) {
      console.error('[FETCH] error:', err);
      setErrorMsg(`Network/Fetch error: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };


  // UI
  
  return (
    <main style={{ minHeight: '100vh', background: 'black', color: 'white' }}>
      {/* Top bar: upload + prompt + analyze */}
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 2000,
        padding: '10px 16px',
        background: 'rgba(0,0,0,0.9)',
        display: 'flex', gap: 12, alignItems: 'center'
      }}>
        <span style={{ whiteSpace: 'nowrap' }}>Upload an image:</span>
        <input type="file" accept="image/*" onChange={handleImageUpload} style={{ color: 'white' }} />
        <input
          type="text"
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder='Describe the emotions of this image.'
          style={{
            flex: 1, minWidth: 200, padding: '6px 10px',
            background: 'rgba(255,255,255,0.1)',
            color: 'white', border: '1px solid #666', borderRadius: 8
          }}
        />
        <button
          onClick={analyzeImage}
          disabled={loading}
          style={{
            padding: '8px 12px',
            border: '1px solid white',
            background: loading ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: 'white', borderRadius: 8,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Analyzing…' : 'Analyze Uploaded Image'}
        </button>
      </div>
  
      {/* Image preview */}
      <div style={{ paddingTop: 66, display: 'flex', justifyContent: 'center' }}>
        {uploadedImage ? (
          <img
            src={uploadedImage}
            alt="preview"
            style={{ maxWidth: '90vw', maxHeight: '70vh', objectFit: 'contain', borderRadius: 12, border: '1px solid #333' }}
          />
        ) : (
          <div style={{ opacity: 0.7, padding: 32 }}>No image uploaded yet.</div>
        )}
      </div>
  
      {/* Interpretation box */}
      {messages.length > 0 && (
        <div style={{ margin: 16 }}>
          <div style={{
            padding: 16,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.05)',
            color: '#eee',
            border: '1px solid #444',
            fontFamily: 'monospace',
            fontSize: 14
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: 16 }}>Image Interpretation</b>
              <button
                onClick={() => copyText((messages[messages.length - 1] || {}).response || '', setCopiedInterp)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: copiedInterp ? '#4ade80' : '#aaa',
                  cursor: 'pointer',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
                title="Copy interpretation"
              >
                <span>{copiedInterp ? '✅ Copied' : '📋 Copy'}</span>
              </button>
            </div>
            <div style={{ marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {(messages[messages.length - 1] || {}).response || ''}
            </div>
          </div>
        </div>
      )}
  
      {/* Mapping output for music generation */}
      {musicParams && (
        <div style={{ margin: 16, display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>
          {/* Music Parameters box */}
          <div style={{
            padding: 16,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.05)',
            color: '#eee',
            border: '1px solid #444',
            fontFamily: 'monospace',
            fontSize: 14
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: 16 }}>Music Parameters</b>
              <button
                onClick={() => copyText(JSON.stringify(musicParams, null, 2), setCopiedJSON)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: copiedJSON ? '#4ade80' : '#aaa',
                  cursor: 'pointer',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
                title="Copy JSON"
              >
                <span>{copiedJSON ? '✅ Copied' : '📋 Copy'}</span>
              </button>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
  {JSON.stringify(musicParams, null, 2)}
            </pre>
          </div>
  
          {/* Primer JSON box */}
          {primerSpec && (
            <div style={{
              padding: 16,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.05)',
              color: '#eee',
              border: '1px solid #444',
              fontFamily: 'monospace',
              fontSize: 14,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: 16 }}>8-bar Primer (JSON for Magenta input)</b>
                <button
                  onClick={() => copyText(JSON.stringify(primerSpec), setCopiedPrimer)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: copiedPrimer ? '#4ade80' : '#aaa',
                    cursor: 'pointer',
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  title="Copy Primer JSON"
                >
                  <span>{copiedPrimer ? '✅ Copied' : '📋 Copy'}</span>
                </button>
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
  {JSON.stringify(primerSpec, null, 2)}
              </pre>
            </div>
          )}

          {/* Generate & Play box */}
<div style={{
  padding: 16,
  borderRadius: 12,
  background: 'rgba(255,255,255,0.05)',
  color: '#eee',
  border: '1px solid #444',
  fontFamily: 'monospace',
  fontSize: 14,
  marginBottom: 32
}}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <b style={{ fontSize: 16 }}>Generate & Play</b>
    <button
      onClick={generateAndPlay}
      disabled={genBusy || !primerSpec}
      style={{
        background: genBusy ? 'rgba(255,255,255,0.2)' : 'transparent',
        border: '1px solid #888',
        color: '#eee',
        borderRadius: 8,
        padding: '6px 10px',
        cursor: genBusy ? 'not-allowed' : 'pointer'
      }}
    >
      {genBusy ? 'Generating…' : 'Generate MIDI'}
    </button>
  </div>

  {genError && (
    <div style={{ marginTop: 10, color: '#fca5a5' }}>
      Error: {genError}
    </div>
  )}

  {audioUrl && (
    <div style={{ marginTop: 12 }}>
      <audio src={audioUrl} controls autoPlay />
      <div style={{ opacity: 0.7, marginTop: 6, fontSize: 12 }}>
        Saved to <code>{audioUrl}</code>
      </div>
    </div>
  )}
</div>

        </div>
      )}
    </main>
    
      /* TTS */
      // <SpeechGenerator ref={speechRef} />
  );
    
}

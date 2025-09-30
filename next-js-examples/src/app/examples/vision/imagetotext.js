'use client'
import React, { useEffect, useRef, useState } from "react";
import SpeechGenerator from '@/components/SpeechGenerator'; // remove if you don't want TTS

export default function ImageEmotionPage() {
  const speechRef = useRef(null);

  // UI state
  const [uploadedImage, setUploadedImage] = useState(null);
  const [promptText, setPromptText] = useState('Describe the emotions of this image.');
  const [loading, setLoading] = useState(false);

  // Diagnostics
  const [errorMsg, setErrorMsg] = useState('');
  const [lastStatus, setLastStatus] = useState(null);
  const [lastRawContent, setLastRawContent] = useState('');

  // Model response state
  const [gptResponse, setGptResponse] = useState(''); // raw string from LLM
  const [messages, setMessages] = useState([]);   // [{request, response}]
  const [showDialog, setShowDialog] = useState(false);

  // Parse model response
  useEffect(() => {
    if (!gptResponse) return;
    try {
      const i = gptResponse.indexOf('{');
      const jsonStr = i >= 0 ? gptResponse.slice(i) : gptResponse;
      const json = JSON.parse(jsonStr);

      if (json && json.request && json.response) {
        setMessages(prev => [...prev, { request: json.request, response: json.response }]);
        if (speechRef.current) speechRef.current.play(json.response); // TTS optional
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

  // File -> base64
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

  // Call LLM (Cornell/OpenAI gateway pattern you used before)
  const analyzeImage = async () => {
    setErrorMsg('');
    setLastStatus(null);
    setLastRawContent('');

    if (!uploadedImage) {
      setErrorMsg('Please upload an image first.');
      return;
    }

    const host = process.env.LLM_HOST || 'https://api.openai.com';  // e.g., https://api.ai.it.cornell.edu
    const apiKey = process.env.OPENAI_API_KEY;
    if (!host || !apiKey) {
      setErrorMsg('Missing LLM_HOST or OPENAI_API_KEY in .env. Restart dev server after editing.');
      return;
    }

    // Cornell sometimes expects the model id to start with "openai."
    const isPublicOpenAI = host.includes('openai.com');
    const modelId = (isPublicOpenAI ? '' : 'openai.') + 'gpt-4o-mini'; // change if your team can’t use this

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
      }
    } catch (err) {
      console.error('[FETCH] error:', err);
      setErrorMsg(`Network/Fetch error: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // Quick UI sanity check without hitting the API
  const mockSuccess = () => {
    setGptResponse(`{"request":"image emotion analysis","response":"Soft, calm tones and gentle lighting convey a peaceful, reflective mood."}`);
  };

  // Dialog bubble
  const DialogBox = () => {
    if (!showDialog) return null;
    const last = (messages[messages.length - 1] || {}).response || '';
    const truncated = last.length > 300 ? last.slice(0, 300) + '…' : last;
    return (
      <div style={{
        position: 'fixed',
        bottom: '8%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '70vw',
        background: 'rgba(0,0,0,0.55)',
        padding: '12px 16px',
        borderRadius: 12,
        fontSize: 18,
        color: 'white',
        textAlign: 'center',
        zIndex: 1500
      }}>
        <p style={{ margin: 0 }}>{truncated}</p>
      </div>
    );
  };

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
        <button
          onClick={mockSuccess}
          style={{
            padding: '8px 12px', border: '1px dashed #aaa', background: 'transparent',
            color: '#aaa', borderRadius: 8
          }}
          title="Simulate a successful model response (no network)"
        >
          Mock Success
        </button>
      </div>

      {/* uncomment if you want to see the debug panel */}
      {/* Debug panel */} 
      {/* <div style={{ paddingTop: 66, paddingLeft: 16, paddingRight: 16 }}>
        {errorMsg && (
          <div style={{ marginTop: 8, padding: 12, borderRadius: 8, background: '#331b1b', color: '#ff8080' }}>
            <b>Error:</b> {errorMsg}
          </div>
        )}
        {(lastStatus !== null || lastRawContent) && (
          <div style={{ marginTop: 8, padding: 12, borderRadius: 8, background: '#1b2033', color: '#c7d2fe' }}>
            <div><b>Status:</b> {String(lastStatus)}</div>
            <div style={{ marginTop: 6 }}>
              <b>Raw content:</b>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{lastRawContent || '(empty)'}</pre>
            </div>
          </div>
        )}
      </div> */}

      {/* Image preview */}
      <div style={{ paddingTop: 16, display: 'flex', justifyContent: 'center' }}>
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

      {/* Dialog with last response */}
      <DialogBox />

      {/* TTS */}
      <SpeechGenerator ref={speechRef} />
    </main>
  );
}

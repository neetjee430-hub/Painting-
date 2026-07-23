import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Paintbrush, Droplet, Eraser, RotateCcw, Download, Palette, Mic, MicOff, Loader2, Hand, Layers, Activity, Split, Pipette, MessageSquare, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import mixbox from 'mixbox';

function hslToRgb(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return {
    r: Math.round(255 * f(0)),
    g: Math.round(255 * f(8)),
    b: Math.round(255 * f(4))
  };
}

const rgbToHex = (r: number, g: number, b: number) => {
  return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase();
};

const lerp = (start: number, end: number, t: number) => {
  return start * (1 - t) + end * t;
};

const mixPaintColors = (c1: {r: number, g: number, b: number}, c2: {r: number, g: number, b: number}, mixRate: number) => {
  const result = mixbox.lerp([c1.r, c1.g, c1.b], [c2.r, c2.g, c2.b], mixRate);
  return { r: result[0], g: result[1], b: result[2] };
};

const KNOWN_COLORS = [
  { r: 255, g: 0, b: 0, name: "Cadmium Red" },
  { r: 0, g: 255, b: 0, name: "Viridian Green" },
  { r: 0, g: 0, b: 255, name: "Cobalt Blue" },
  { r: 255, g: 255, b: 0, name: "Cadmium Yellow" },
  { r: 0, g: 255, b: 255, name: "Cyan" },
  { r: 255, g: 0, b: 255, name: "Magenta" },
  { r: 255, g: 255, b: 255, name: "Titanium White" },
  { r: 0, g: 0, b: 0, name: "Ivory Black" },
  { r: 128, g: 128, b: 128, name: "Neutral Gray" },
  { r: 165, g: 42, b: 42, name: "Burnt Sienna" },
  { r: 210, g: 180, b: 140, name: "Raw Umber" },
  { r: 255, g: 165, b: 0, name: "Cadmium Orange" },
  { r: 75, g: 0, b: 130, name: "Dioxazine Purple" },
  { r: 255, g: 192, b: 203, name: "Rose Madder" }
];

const getColorName = (r: number, g: number, b: number) => {
  let minDist = Infinity;
  let closestName = "Mixed Hue";
  
  for (const kc of KNOWN_COLORS) {
    const dist = Math.sqrt(Math.pow(r - kc.r, 2) + Math.pow(g - kc.g, 2) + Math.pow(b - kc.b, 2));
    if (dist < minDist) {
      minDist = dist;
      closestName = kc.name;
    }
  }
  
  if (minDist > 100) return "Mixed Hue";
  if (minDist > 30) return `Tinted ${closestName}`;
  return closestName;
};

// Generate 251 colors for a massive master palette
const COLORS = (() => {
  const colors = [
    { r: 227, g: 38, b: 54 },   // Alizarin Crimson (Real Red)
    { r: 255, g: 211, b: 0 },   // Cadmium Yellow
    { r: 0, g: 71, b: 171 },    // Cobalt Blue (Real Blue)
    { r: 64, g: 130, b: 109 },  // Viridian (Real Green)
    { r: 255, g: 140, b: 0 },   // Cadmium Orange
    { r: 75, g: 0, b: 130 },    // Dioxazine Purple
    { r: 245, g: 245, b: 245 }, // Titanium White
    { r: 36, g: 33, b: 36 }     // Ivory Black
  ];
  const hues = [0, 15, 30, 45, 60, 75, 90, 120, 150, 180, 210, 240, 270, 300, 330, 345];
  const sats = [100, 70, 40];
  const lits = [20, 40, 50, 60, 80];
  
  for (let s of sats) {
    for (let l of lits) {
      for (let h of hues) {
        colors.push(hslToRgb(h, s, l));
      }
    }
  }
  for (let l = 0; l <= 100; l += 10) {
    colors.push(hslToRgb(0, 0, l));
  }
  return colors;
})();

const BG_COLORS = [
  '#050505',
  '#ffffff',
  '#f5ebd9',
  '#2a2a2a'
];

class AudioEngine {
  ctx: AudioContext | null = null;
  lastPlay: number = 0;
  ambientOsc: OscillatorNode | null = null;
  ambientGain: GainNode | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.startAmbient();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  startAmbient() {
    if (!this.ctx || this.ambientOsc) return;
    this.ambientOsc = this.ctx.createOscillator();
    this.ambientGain = this.ctx.createGain();
    
    // Create a very soft, low-frequency drone for relaxation
    this.ambientOsc.type = 'sine';
    this.ambientOsc.frequency.value = 110; // A2
    
    // Add slow modulation for "breathing" effect
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.05; // very slow
    
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 2; // mod depth
    
    lfo.connect(lfoGain);
    lfoGain.connect(this.ambientOsc.frequency);
    lfo.start();

    this.ambientGain.gain.value = 0;
    this.ambientGain.gain.linearRampToValueAtTime(0.03, this.ctx.currentTime + 5); // fade in over 5s
    
    this.ambientOsc.connect(this.ambientGain);
    this.ambientGain.connect(this.ctx.destination);
    
    this.ambientOsc.start();
  }

  playBrush(velocity: number, isBlend: boolean, pressure: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastPlay < 0.05) return; 
    this.lastPlay = now;

    // Synthesize texture noise for bristles (softer for real paint)
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.5;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    // Lowpass filter to simulate the thick, wet paint sound (muffled)
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = isBlend ? 300 + velocity * 5 : 600 + velocity * 10;
    
    const noiseGain = this.ctx.createGain();
    
    // Scale volume based on pointer velocity and pressure
    const normalizedVel = Math.min(velocity / 20, 1);
    const vol = (normalizedVel * 0.05 + 0.01) * Math.max(0.2, pressure); 
    
    noiseGain.gain.setValueAtTime(vol, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noise.start(now);
  }
}
const audio = new AudioEngine();

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wetnessCanvasRef = useRef<HTMLCanvasElement>(null);
  const mixColorRef = useRef<HTMLDivElement>(null);
  const mixTextRef = useRef<HTMLSpanElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  
  const [tool, setTool] = useState<'paint' | 'blend' | 'eraser' | 'smudge' | 'picker' | 'knife' | 'water'>('paint');
  const [activeColor, setActiveColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(40);
  const [showTexture, setShowTexture] = useState(true);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [showGallery, setShowGallery] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [savedArtworks, setSavedArtworks] = useState<string[]>([]);
  const [usePressure, setUsePressure] = useState(false);
  const [symmetryMode, setSymmetryMode] = useState(false);
  
  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);
  const pendingStrokesRef = useRef<{x: number, y: number, pressure: number}[]>([]);

  const saveUndoState = useCallback(() => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        undoStackRef.current.push(ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height));
        if (undoStackRef.current.length > 15) undoStackRef.current.shift();
        redoStackRef.current = [];
      }
    }
  }, []);

  const handleUndo = useCallback(() => {
    if (canvasRef.current && undoStackRef.current.length > 0) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        redoStackRef.current.push(ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height));
        const previousState = undoStackRef.current.pop();
        if (previousState) ctx.putImageData(previousState, 0, 0);
      }
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (canvasRef.current && redoStackRef.current.length > 0) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        undoStackRef.current.push(ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height));
        const nextState = redoStackRef.current.pop();
        if (nextState) ctx.putImageData(nextState, 0, 0);
      }
    }
  }, []);

  const [xp, setXp] = useState(() => parseInt(localStorage.getItem('promix-xp') || '0'));
  const [floatingXPs, setFloatingXPs] = useState<{id: number, x: number, y: number, amount: number}[]>([]);
  const accumulatedXpRef = useRef(0);
  const xpIdRef = useRef(0);
  useEffect(() => {
     localStorage.setItem('promix-xp', xp.toString());
  }, [xp]);

  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const prevLevelRef = useRef(level);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  useEffect(() => {
     if (level > prevLevelRef.current) {
        setLevelUp(level);
        setTimeout(() => setLevelUp(null), 4000);
        prevLevelRef.current = level;
     }
  }, [level]);

  const isUnlocked = useCallback((feature: string) => {
     if (feature === 'paint' || feature === 'eraser' || feature === 'blend') return true;
     if (feature === 'picker') return level >= 2;
     if (feature === 'smudge') return level >= 3;
     if (feature === 'knife') return level >= 4;
     if (feature === 'water') return level >= 5;
     return false;
  }, [level]);

  const [dailyChallenge, setDailyChallenge] = useState(() => {
     const today = new Date().toISOString().split('T')[0];
     const stored = localStorage.getItem('promix-challenge');
     if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.date === today) return parsed;
     }
     return {
        date: today,
        prompt: "Mix a color that feels like a crisp autumn morning and paint a leaf.",
        goalColor: { r: 210, g: 105, b: 30 },
        completed: false
     };
  });
  
  const challengeCompletedRef = useRef(dailyChallenge.completed);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: string, text: string}[]>([
     { role: 'model', text: `Hello! I'm your AI Art Coach. Ready for today's challenge? ${dailyChallenge.prompt}` }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
     if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
     }
  }, [chatMessages]);

  const sendMessage = async () => {
     if (!chatInput.trim() && !canvasRef.current) return;
     const text = chatInput;
     setChatInput('');
     
     const newMessages = [...chatMessages, { role: 'user', text }];
     setChatMessages(newMessages);
     setIsChatLoading(true);
     
     try {
        let image = undefined;
        if (canvasRef.current) {
           image = canvasRef.current.toDataURL('image/png');
        }
        
        const res = await fetch('/api/chat', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ message: text, image, history: chatMessages })
        });
        const data = await res.json();
        if (data.text) {
           setChatMessages([...newMessages, { role: 'model', text: data.text }]);
        }
     } catch(e) {
        setChatMessages([...newMessages, { role: 'model', text: "Oops, I'm having trouble seeing right now." }]);
     }
     setIsChatLoading(false);
  };
  
  const BG_COLORS = ['#ffffff', '#000000', '#f5f5dc', '#2c3e50', '#8b4513'];

  // Load gallery
  const loadGallery = useCallback(() => {
    const art = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('artwork-')) {
            art.push({ key, data: localStorage.getItem(key) as string });
        }
    }
    // Sort descending by key
    art.sort((a, b) => b.key.localeCompare(a.key));
    setSavedArtworks(art.map(a => a.data));
  }, []);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);
  
  const currentBrushColor = useRef({ ...COLORS[0] });
  const pointer = useRef({ isDown: false, x: 0, y: 0 });
  
  const drips = useRef<{x: number, y: number, color: {r: number, g: number, b: number}, size: number, life: number}[]>([]);
  
  const paintLoad = useRef(1.0);
  const bristles = useRef(Array.from({ length: 30 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random());
    return {
      offsetX: Math.cos(angle) * rad,
      offsetY: Math.sin(angle) * rad,
      size: Math.random() * 0.3 + 0.1
    };
  }));

  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);

  const toggleVoice = async () => {
    if (isVoiceActive) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (inputAudioCtxRef.current) {
        inputAudioCtxRef.current.close();
        inputAudioCtxRef.current = null;
      }
      setIsVoiceActive(false);
      return;
    }

    setIsConnecting(true);
    try {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}/live`);
      wsRef.current = ws;

      const inputAudioCtx = new AudioContext({ sampleRate: 16000 });
      inputAudioCtxRef.current = inputAudioCtx;
      const outputAudioCtx = new AudioContext({ sampleRate: 24000 });
      audioCtxRef.current = outputAudioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = inputAudioCtx.createMediaStreamSource(stream);
      const processor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
      source.connect(processor);
      processor.connect(inputAudioCtx.destination);

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const channelData = e.inputBuffer.getChannelData(0);
          const pcmData = new Int16Array(channelData.length);
          for (let i = 0; i < channelData.length; i++) {
            pcmData[i] = Math.max(-32768, Math.min(32767, channelData[i] * 32768));
          }
          const buffer = new ArrayBuffer(pcmData.length * 2);
          const view = new DataView(buffer);
          for (let i = 0; i < pcmData.length; i++) {
            view.setInt16(i * 2, pcmData[i], true); // little endian
          }
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          ws.send(JSON.stringify({ audio: base64 }));
        }
      };

      let nextStartTime = 0;
      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.audio) {
          const audioCtx = audioCtxRef.current;
          if (!audioCtx) return;
          
          const binary = atob(msg.audio);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          
          const audioBuffer = audioCtx.createBuffer(1, bytes.length / 2, 24000);
          const channelData = audioBuffer.getChannelData(0);
          const dataView = new DataView(bytes.buffer);
          for (let i = 0; i < channelData.length; i++) {
            channelData[i] = dataView.getInt16(i * 2, true) / 32768;
          }

          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioCtx.destination);
          
          if (nextStartTime < audioCtx.currentTime) {
             nextStartTime = audioCtx.currentTime;
          }
          source.start(nextStartTime);
          nextStartTime += audioBuffer.duration;
        }
        if (msg.interrupted) {
          nextStartTime = 0;
        }
      };

      ws.onopen = () => {
        setIsConnecting(false);
        setIsVoiceActive(true);
      };
      
      ws.onclose = () => {
        setIsVoiceActive(false);
        setIsConnecting(false);
      }
    } catch (e) {
      console.error("Failed to start voice", e);
      setIsConnecting(false);
      setIsVoiceActive(false);
    }
  };

  const lastHexRef = useRef('');
  const loopRef = useRef<() => void>();

  loopRef.current = () => {
      const r = Math.round(currentBrushColor.current.r);
      const g = Math.round(currentBrushColor.current.g);
      const b = Math.round(currentBrushColor.current.b);
      const hex = rgbToHex(r, g, b);
      if (hex !== lastHexRef.current) {
        if (mixColorRef.current) mixColorRef.current.style.backgroundColor = hex;
        if (mixTextRef.current) mixTextRef.current.innerText = getColorName(r, g, b);
        lastHexRef.current = hex;
        
        if (!challengeCompletedRef.current) {
           const gr = dailyChallenge.goalColor.r;
           const gg = dailyChallenge.goalColor.g;
           const gb = dailyChallenge.goalColor.b;
           const dist = Math.sqrt((r-gr)**2 + (g-gg)**2 + (b-gb)**2);
           if (dist < 40) {
              challengeCompletedRef.current = true;
              setDailyChallenge(prev => {
                 const next = { ...prev, completed: true };
                 localStorage.setItem('promix-challenge', JSON.stringify(next));
                 return next;
              });
              setXp(prev => prev + 500);
              setChatMessages(prev => [...prev, { role: 'model', text: 'Amazing! You successfully mixed the autumn leaf color! +500 XP' }]);
              setChatOpen(true);
           }
        }
      }
      
      const canvas = canvasRef.current;
      const wetCanvas = wetnessCanvasRef.current;
      
      if (wetCanvas) {
         const wetCtx = wetCanvas.getContext('2d');
         if (wetCtx) {
            wetCtx.globalCompositeOperation = 'source-over';
            wetCtx.fillStyle = 'rgba(0,0,0,0.002)'; // Fade out to black (dry) slowly
            wetCtx.fillRect(0, 0, wetCanvas.width, wetCanvas.height);
         }
      }

      if (canvas && tool !== 'eraser') {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          for (let i = drips.current.length - 1; i >= 0; i--) {
            const d = drips.current[i];
            d.y += 0.5 + Math.random() * 1.5;
            d.size *= 0.99;
            d.life -= 0.005;
             
            ctx.beginPath();
            const grad = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.size);
            grad.addColorStop(0, `rgba(${d.color.r}, ${d.color.g}, ${d.color.b}, ${d.life * 0.15})`);
            grad.addColorStop(1, `rgba(${d.color.r}, ${d.color.g}, ${d.color.b}, 0)`);
            ctx.fillStyle = grad;
            ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
            ctx.fill();
             
            if (d.life <= 0 || d.size < 1) {
              drips.current.splice(i, 1);
            }
          }
        }
      }
      
      if (pendingStrokesRef.current.length > 0) {
         const batchSize = Math.min(5, pendingStrokesRef.current.length);
         const strokesToProcess = pendingStrokesRef.current.splice(0, batchSize);
         for (const stroke of strokesToProcess) {
            processStroke(stroke.x, stroke.y, stroke.pressure);
         }
      }
  };

  useEffect(() => {
    let frameId: number;
    const tick = () => {
       loopRef.current?.();
       frameId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wetCanvas = wetnessCanvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    
    // Save existing content before resize
    const existing = document.createElement('canvas');
    existing.width = canvas.width;
    existing.height = canvas.height;
    const eCtx = existing.getContext('2d');
    if (eCtx) eCtx.drawImage(canvas, 0, 0);
    
    let wExisting;
    if (wetCanvas) {
       wExisting = document.createElement('canvas');
       wExisting.width = wetCanvas.width;
       wExisting.height = wetCanvas.height;
       wExisting.getContext('2d')?.drawImage(wetCanvas, 0, 0);
    }

    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    
    if (wetCanvas) {
       wetCanvas.width = parent.clientWidth;
       wetCanvas.height = parent.clientHeight;
    }
    
    // Restore
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(existing, 0, 0);
    
    if (wetCanvas && wExisting) {
       wetCanvas.getContext('2d')?.drawImage(wExisting, 0, 0);
    }
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c2 = document.createElement('canvas');
    c2.width = canvas.width;
    c2.height = canvas.height;
    const ctx = c2.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = bgColor; 
    ctx.fillRect(0, 0, c2.width, c2.height);
    ctx.drawImage(canvas, 0, 0);
    
    const dataUrl = c2.toDataURL();
    localStorage.setItem(`artwork-${Date.now()}`, dataUrl);
    loadGallery();
    
    const link = document.createElement('a');
    link.download = 'pro-mix-canvas.png';
    link.href = dataUrl;
    link.click();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    saveUndoState();
    audio.init();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    pointer.current = {
      isDown: true,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    if (cursorRef.current) {
      cursorRef.current.style.opacity = '1';
      cursorRef.current.style.borderWidth = `${Math.max(2, (e.pressure || 0.5) * 6)}px`;
    }
    
    // If it's a new paint stroke, reset the brush to the pure palette color
    if (tool === 'paint') {
      currentBrushColor.current = { ...activeColor };
      paintLoad.current = 1.0;
    } else if (tool === 'blend' || tool === 'smudge') {
      paintLoad.current = 0.0;
    } else if (tool === 'picker') {
      const ctx = canvas.getContext('2d');
      if (ctx) {
         const x = e.clientX - rect.left;
         const y = e.clientY - rect.top;
         const data = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
         if (data[3] > 0) {
            setActiveColor({ r: data[0], g: data[1], b: data[2] });
            currentBrushColor.current = { r: data[0], g: data[1], b: data[2] };
         }
      }
    }
  };

  const updateCursor = (e: React.PointerEvent) => {
    if (cursorRef.current) {
      cursorRef.current.style.left = `${e.clientX}px`;
      cursorRef.current.style.top = `${e.clientY}px`;
      const pressureValue = usePressure ? (e.pressure !== undefined && e.pressure !== 0 ? e.pressure : 0.5) : 0.8;
      const pressure = pointer.current.isDown ? pressureValue : 0.2;
      const currentRadius = Math.max(1, brushSize * (pointer.current.isDown ? pressureValue : 0.5));
      cursorRef.current.style.width = `${currentRadius * 2}px`;
      cursorRef.current.style.height = `${currentRadius * 2}px`;
      
      const ring = cursorRef.current.querySelector('.cursor-ring') as HTMLDivElement;
      
      if (ring) {
        let displayColor = currentBrushColor.current;
        if (!pointer.current.isDown && tool === 'paint') {
           displayColor = activeColor;
        } else if (tool === 'eraser') {
           displayColor = { r: 255, g: 255, b: 255 };
        }
        
        const hexColor = rgbToHex(displayColor.r, displayColor.g, displayColor.b);
        ring.style.borderColor = hexColor;
        ring.style.backgroundColor = `rgba(${displayColor.r}, ${displayColor.g}, ${displayColor.b}, 0.2)`;
        
        if (pointer.current.isDown) {
           ring.style.borderWidth = `${Math.max(2, pressureValue * 6)}px`;
           ring.style.transform = `scale(${0.8 + pressureValue * 0.4})`;
        } else {
           ring.style.borderWidth = '1.5px';
           ring.style.transform = `scale(1)`;
        }
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    updateCursor(e);
    if (!pointer.current.isDown) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pressureValue = usePressure ? (e.pressure !== undefined && e.pressure !== 0 ? e.pressure : 0.5) : 0.8;
    pendingStrokesRef.current.push({
       x: e.clientX,
       y: e.clientY,
       pressure: pressureValue
    });
  };

  const processStroke = (clientX: number, clientY: number, pressureEventValue: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // willReadFrequently optimizes for getImageData performance
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const lastX = pointer.current.x;
    const lastY = pointer.current.y;
    
    const dist = Math.hypot(x - lastX, y - lastY);
    const pressure = pressureEventValue;
    
    const w = canvas.width;
    const h = canvas.height;
    
    const strokes = symmetryMode ? [
       { nx: x, ny: y, lx: lastX, ly: lastY },
       { nx: w - x, ny: y, lx: w - lastX, ly: lastY },
       { nx: x, ny: h - y, lx: lastX, ly: h - lastY },
       { nx: w - x, ny: h - y, lx: w - lastX, ly: h - lastY }
    ] : [
       { nx: x, ny: y, lx: lastX, ly: lastY }
    ];

    const wetCtx = wetnessCanvasRef.current?.getContext('2d', { willReadFrequently: true });
    if (wetCtx && tool !== 'picker' && tool !== 'eraser') {
       strokes.forEach(st => {
          wetCtx.globalCompositeOperation = 'source-over';
          wetCtx.beginPath();
          wetCtx.moveTo(st.lx, st.ly);
          wetCtx.lineTo(st.nx, st.ny);
          wetCtx.lineWidth = brushSize * pressure;
          wetCtx.lineCap = 'round';
          wetCtx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
          wetCtx.shadowColor = 'transparent';
          wetCtx.stroke();
       });
    }

    if (dist > 0 && tool !== 'eraser' && tool !== 'picker') {
      audio.playBrush(dist, tool === 'blend' || tool === 'smudge' || tool === 'water', pressure);
      
      if ((tool === 'paint' || tool === 'water') && Math.random() < (tool === 'water' ? 0.4 : 0.15)) {
         strokes.forEach(st => {
             drips.current.push({
                x: st.nx,
                y: st.ny,
                color: { ...currentBrushColor.current },
                size: brushSize * pressure * (tool === 'water' ? 0.6 : 0.3) + Math.random() * brushSize * (tool === 'water' ? 0.5 : 0.3),
                life: 1
             });
         });
      }
    }

    if (tool === 'picker') {
       const data = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
       if (data[3] > 0) {
          setActiveColor({ r: data[0], g: data[1], b: data[2] });
          currentBrushColor.current = { r: data[0], g: data[1], b: data[2] };
       }
       pointer.current.x = x;
       pointer.current.y = y;
       return;
    }
    
    if (tool === 'knife') {
       strokes.forEach(st => {
           ctx.globalCompositeOperation = 'source-over';
           const angle = Math.atan2(st.ny - st.ly, st.nx - st.lx);
           const r = brushSize * pressure;
           ctx.save();
           ctx.translate(st.nx, st.ny);
           ctx.rotate(angle);
           ctx.fillStyle = `rgba(${currentBrushColor.current.r}, ${currentBrushColor.current.g}, ${currentBrushColor.current.b}, 0.9)`;
           ctx.fillRect(-r, -r/4, r * 2, r/2);
           ctx.restore();
       });
       pointer.current.x = x;
       pointer.current.y = y;
       const gained = Math.floor(dist * 0.1);
       if (gained > 0) {
          accumulatedXpRef.current += gained;
          setXp(prev => prev + gained);
       }
       return;
    }

    if (tool === 'eraser') {
       strokes.forEach(st => {
           ctx.globalCompositeOperation = 'destination-out';
           ctx.lineWidth = brushSize * pressure * 2;
           ctx.lineCap = 'round';
           ctx.beginPath();
           ctx.moveTo(st.lx, st.ly);
           ctx.lineTo(st.nx, st.ny);
           ctx.stroke();
           ctx.globalCompositeOperation = 'source-over';
       });
    } else if (tool === 'smudge') {
       strokes.forEach(st => {
           const currentRadius = Math.max(1, Math.floor(brushSize * pressure));
           const size = currentRadius * 2;
           const step = Math.max(1, currentRadius * 0.15);
           const count = Math.max(1, Math.floor(dist / step));
           
           for (let i = 1; i <= count; i++) {
              const prevX = Math.floor(st.lx + (st.nx - st.lx) * ((i - 1) / count));
              const prevY = Math.floor(st.ly + (st.ny - st.ly) * ((i - 1) / count));
              const currX = Math.floor(st.lx + (st.nx - st.lx) * (i / count));
              const currY = Math.floor(st.ly + (st.ny - st.ly) * (i / count));
              
              const sx = prevX - currentRadius;
              const sy = prevY - currentRadius;
              const tx = currX - currentRadius;
              const ty = currY - currentRadius;
              
              if (sx >= 0 && sy >= 0 && tx >= 0 && ty >= 0 && 
                  sx + size < canvas.width && sy + size < canvas.height &&
                  tx + size < canvas.width && ty + size < canvas.height) {
                  
                  const sourcePixels = ctx.getImageData(sx, sy, size, size);
                  const targetPixels = ctx.getImageData(tx, ty, size, size);
                  const mixCache = new Map<string, number[]>();
                  
                  // Blend source into target using pigment accumulation
                  for (let py = 0; py < size; py++) {
                    for (let px = 0; px < size; px++) {
                      const distCenter = Math.hypot(px - currentRadius, py - currentRadius);
                      if (distCenter < currentRadius) {
                         const falloff = 1 - Math.pow(distCenter / currentRadius, 2);
                         const strength = 0.5 * falloff * 0.5;
                         
                         const idx = (py * size + px) * 4;
                         const sr = sourcePixels.data[idx];
                         const sg = sourcePixels.data[idx+1];
                         const sb = sourcePixels.data[idx+2];
                         const sa = sourcePixels.data[idx+3];
                         
                         if (sa > 0) {
                             const tr = targetPixels.data[idx];
                             const tg = targetPixels.data[idx+1];
                             const tb = targetPixels.data[idx+2];
                             const ta = targetPixels.data[idx+3];
                             
                             // New pigment being added from source to target
                             const addedAlpha = strength * 255 * (sa / 255);
                             
                             if (ta === 0) {
                                 targetPixels.data[idx] = sr;
                                 targetPixels.data[idx+1] = sg;
                                 targetPixels.data[idx+2] = sb;
                                 targetPixels.data[idx+3] = Math.min(255, addedAlpha);
                             } else {
                                 const totalAlpha = ta + addedAlpha;
                                 const mixRatio = Math.min(1, addedAlpha / totalAlpha);
                                 const mQ = Math.round(mixRatio * 32);
                                 
                                 if (mQ > 0) {
                                     const key = `${tr},${tg},${tb},${sr},${sg},${sb},${mQ}`;
                                     let mixed = mixCache.get(key);
                                     if (!mixed) {
                                         mixed = mixbox.lerp([tr, tg, tb], [sr, sg, sb], mQ / 32.0);
                                         mixCache.set(key, mixed);
                                     }
                                     targetPixels.data[idx] = mixed[0];
                                     targetPixels.data[idx+1] = mixed[1];
                                     targetPixels.data[idx+2] = mixed[2];
                                     targetPixels.data[idx+3] = Math.min(255, totalAlpha);
                                 }
                             }
                         }
                      }
                    }
                  }
                  ctx.putImageData(targetPixels, tx, ty);
              }
           }
       });
    } else {
       const currentRadius = Math.max(1, brushSize * (tool === 'blend' || tool === 'water' ? 1.2 : pressure));
       const velocity = Math.max(1, dist);
       
       let baseAlpha = tool === 'blend' ? 0.05 : tool === 'water' ? 0.02 : paintLoad.current * 0.8 + 0.2;
       const alpha = Math.max(0.01, (tool === 'paint' ? Math.min(1, baseAlpha * (0.5 + pressure)) : baseAlpha * pressure) / (1 + velocity * 0.05));
       const step = Math.max(1, currentRadius * 0.1);
       const count = Math.max(1, Math.floor(dist / step));
       
       strokes.forEach((st, sIndex) => {
           for (let i = 0; i <= count; i++) {
             const tx = Math.floor(st.lx + (st.nx - st.lx) * (i / count));
             const ty = Math.floor(st.ly + (st.ny - st.ly) * (i / count));
             
             // Sample surrounding pixels only on the primary stroke
             if (sIndex === 0) {
                 try {
                    const sSize = Math.max(1, Math.floor(currentRadius * (tool === 'water' ? 1.5 : 0.5)));
                    const sx = Math.floor(tx - sSize / 2);
                    const sy = Math.floor(ty - sSize / 2);
                    if (sx >= 0 && sy >= 0 && sx + sSize < canvas.width && sy + sSize < canvas.height) {
                        const sampleData = ctx.getImageData(sx, sy, sSize, sSize).data;
                        let avgR = 0, avgG = 0, avgB = 0, countPixels = 0;
                        for (let j = 0; j < sampleData.length; j += 4) {
                           if (sampleData[j+3] > 0) {
                               avgR += sampleData[j];
                               avgG += sampleData[j+1];
                               avgB += sampleData[j+2];
                               countPixels++;
                           }
                        }
                        if (countPixels > 0) {
                           avgR /= countPixels;
                           avgG /= countPixels;
                           avgB /= countPixels;
                           
                           const mixRate = tool === 'blend' ? 0.6 : tool === 'water' ? 0.9 : (0.05 + (1 - paintLoad.current) * 0.2);
                           const mixed = mixPaintColors(currentBrushColor.current, { r: avgR, g: avgG, b: avgB }, mixRate);
                           currentBrushColor.current.r = mixed.r;
                           currentBrushColor.current.g = mixed.g;
                           currentBrushColor.current.b = mixed.b;
                        }
                    }
                 } catch(e) {}
             }
             
             const c = currentBrushColor.current;
             
             try {
                 const R = Math.ceil(currentRadius);
                 const size = R * 2;
                 const sx = tx - R;
                 const sy = ty - R;
                 
                 if (sx >= 0 && sy >= 0 && sx + size < canvas.width && sy + size < canvas.height) {
                     const mask = new Float32Array(size * size);
                     
                     if (tool === 'blend' || tool === 'water') {
                         for (let my = 0; my < size; my++) {
                             for (let mx = 0; mx < size; mx++) {
                                 const distSq = (mx - R) * (mx - R) + (my - R) * (my - R);
                                 if (distSq <= R * R) {
                                     mask[my * size + mx] = alpha * (1 - Math.sqrt(distSq) / R);
                                 }
                             }
                         }
                     } else {
                         bristles.current.forEach(bristle => {
                            const bx = Math.round(R + bristle.offsetX * currentRadius);
                            const by = Math.round(R + bristle.offsetY * currentRadius);
                            const br = currentRadius * bristle.size;
                            const brSq = br * br;
                            
                            for (let my = Math.max(0, Math.floor(by - br)); my <= Math.min(size - 1, Math.ceil(by + br)); my++) {
                               for (let mx = Math.max(0, Math.floor(bx - br)); mx <= Math.min(size - 1, Math.ceil(bx + br)); mx++) {
                                  const distSq = (mx - bx) * (mx - bx) + (my - by) * (my - by);
                                  if (distSq <= brSq) {
                                     mask[my * size + mx] += alpha * (1 - Math.sqrt(distSq) / br);
                                  }
                               }
                            }
                         });
                     }
                     
                     const imageData = ctx.getImageData(sx, sy, size, size);
                     const data = imageData.data;
                     const mixCache = new Map<number, number[]>();
     
                     for (let idx = 0; idx < mask.length; idx++) {
                        let strength = Math.min(1, mask[idx]);
                        if (strength > 0.01) {
                            const px = idx * 4;
                            const canvasAlpha = data[px + 3];
                            
                            if (canvasAlpha === 0) {
                                data[px] = c.r;
                                data[px+1] = c.g;
                                data[px+2] = c.b;
                                data[px+3] = Math.min(255, strength * 255);
                            } else {
                                const addedAlpha = strength * 255;
                                const totalAlpha = canvasAlpha + addedAlpha;
                                const mixRatio = Math.min(1, addedAlpha / totalAlpha);
                                const mQ = Math.round(mixRatio * 32);
                                
                                if (mQ > 0) {
                                    const r = data[px];
                                    const g = data[px+1];
                                    const b = data[px+2];
                                    
                                    const key = (r << 16) | (g << 8) | b | (mQ << 24);
                                    let mixed = mixCache.get(key);
                                    
                                    if (!mixed) {
                                        mixed = mixbox.lerp([r, g, b], [c.r, c.g, c.b], mQ / 32.0);
                                        mixCache.set(key, mixed);
                                    }
                                    
                                    data[px] = mixed[0];
                                    data[px+1] = mixed[1];
                                    data[px+2] = mixed[2];
                                    data[px+3] = Math.min(255, totalAlpha);
                                }
                            }
                        }
                     }
                     ctx.putImageData(imageData, sx, sy);
                 }
             } catch(e) {}
           }
       });
       
       if (tool === 'paint') {
          paintLoad.current = Math.max(0, paintLoad.current - dist * 0.001 * pressure);
       }
    }

    pointer.current.x = x;
    pointer.current.y = y;
    const gained = Math.floor(dist * 0.1);
    if (gained > 0) {
       accumulatedXpRef.current += gained;
       setXp(prev => prev + gained);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointer.current.isDown = false;
    if (cursorRef.current) {
       cursorRef.current.style.opacity = '0.4';
       cursorRef.current.style.borderWidth = '1.5px';
    }
    
    if (accumulatedXpRef.current > 0) {
       const amount = accumulatedXpRef.current;
       const x = e.clientX;
       const y = e.clientY;
       const id = xpIdRef.current++;
       setFloatingXPs(prev => [...prev, { id, x, y, amount }]);
       setTimeout(() => {
          setFloatingXPs(prev => prev.filter(p => p.id !== id));
       }, 2000);
       accumulatedXpRef.current = 0;
    }
  };

  const handlePointerEnter = (e: React.PointerEvent) => {
    if (cursorRef.current) {
       cursorRef.current.style.display = 'block';
       updateCursor(e);
    }
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    pointer.current.isDown = false;
    if (cursorRef.current) {
       cursorRef.current.style.display = 'none';
    }
    
    if (accumulatedXpRef.current > 0) {
       const amount = accumulatedXpRef.current;
       const x = e.clientX;
       const y = e.clientY;
       const id = xpIdRef.current++;
       setFloatingXPs(prev => [...prev, { id, x, y, amount }]);
       setTimeout(() => {
          setFloatingXPs(prev => prev.filter(p => p.id !== id));
       }, 2000);
       accumulatedXpRef.current = 0;
    }
  };

  const handleColorSelect = (c: typeof COLORS[0]) => {
    audio.init();
    setActiveColor(c);
    currentBrushColor.current = { ...c };
    if (tool === 'eraser') setTool('paint');
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#050505] text-white font-sans select-none">
      
      {/* Canvas Area (Full Screen) */}
      <main 
        className="absolute inset-0 cursor-none touch-none transition-colors duration-500"
        style={{ backgroundColor: bgColor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerEnter={handlePointerEnter}
      >
        {showTexture && (
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100\' height=\'100\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")' }}></div>
        )}
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full block" 
          style={{ touchAction: 'none' }}
        />
        <canvas 
          ref={wetnessCanvasRef} 
          className="absolute inset-0 w-full h-full block pointer-events-none mix-blend-overlay opacity-30"
          style={{ touchAction: 'none' }}
        />
        <AnimatePresence>
          {floatingXPs.map(fxp => (
             <motion.div
               key={fxp.id}
               initial={{ opacity: 1, y: 0, scale: 0.5 }}
               animate={{ opacity: 0, y: -50, scale: 1.2 }}
               exit={{ opacity: 0 }}
               transition={{ duration: 1, ease: "easeOut" }}
               className="absolute pointer-events-none font-black text-xl text-orange-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] z-50 flex items-center gap-1"
               style={{ left: fxp.x - 20, top: fxp.y - 40 }}
             >
               +{fxp.amount} <Flame className="w-4 h-4" />
             </motion.div>
          ))}
        </AnimatePresence>
      </main>

      {/* Floating Header */}
      <motion.header 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="absolute top-6 left-6 right-6 flex items-start justify-between pointer-events-none z-20"
      >
        <div className="flex flex-col gap-4 pointer-events-auto">
          <div className="flex items-center gap-4 bg-zinc-900/80 backdrop-blur-xl border border-white/10 px-5 py-3 rounded-full shadow-2xl">
            <Palette className="w-5 h-5 text-zinc-400" />
            <h1 className="font-semibold tracking-wider text-sm uppercase text-zinc-200">Pro Mix</h1>
            
            <div className="h-4 w-px bg-white/20 mx-2" />
            
            {/* Canvas Color Picker */}
            <div className="flex items-center gap-3">
               <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest hidden sm:block">Canvas</span>
               <div className="flex gap-1.5">
                 {BG_COLORS.map(c => (
                   <button 
                     key={c}
                     onClick={() => {
                        setBgColor(c);
                        clearCanvas();
                     }}
                     className={`w-5 h-5 rounded-full border transition-all ${bgColor === c ? 'border-blue-500 scale-125 z-10' : 'border-white/20 hover:border-white/50 hover:scale-110'}`}
                     style={{ backgroundColor: c }}
                     title="Change canvas background (Clears artwork)"
                   />
                 ))}
                 <button 
                   onClick={() => {
                      setBgColor('#1f1712'); // AI Suggested based on current mix
                      clearCanvas();
                   }}
                   className="w-5 h-5 rounded-full border border-white/20 hover:border-white/50 hover:scale-110 flex items-center justify-center bg-gradient-to-tr from-purple-500 to-orange-500"
                   title="AI Suggest Canvas Color"
                 >
                   <MessageSquare className="w-2.5 h-2.5 text-white" />
                 </button>
               </div>
            </div>

            <div className="h-4 w-px bg-white/20 mx-2 hidden sm:block" />
            
            <button
              onClick={() => setShowGallery(true)}
              className="text-xs font-bold uppercase tracking-widest text-zinc-300 hover:text-white transition-colors"
            >
              Gallery ({savedArtworks.length})
            </button>
            <button
              onClick={() => setShowProfile(true)}
              className="text-xs font-bold uppercase tracking-widest text-zinc-300 hover:text-white transition-colors ml-4"
            >
              Profile
            </button>
          </div>
          
          <button onClick={() => setShowProfile(true)} className="bg-zinc-900/80 backdrop-blur-xl border border-white/10 p-4 rounded-3xl shadow-2xl flex flex-col items-center gap-3 hover:bg-zinc-800 transition-colors text-left w-full">
             <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg text-lg">
                L{level}
             </div>
             <div className="flex flex-col items-center">
               <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400">Artist</span>
               <span className="text-[10px] uppercase font-bold tracking-widest text-orange-400 mt-1 flex items-center gap-1"><Flame className="w-3 h-3" /> Streak: {Math.floor(level/2)}</span>
             </div>
          </button>
        </div>

        {/* Floating Top Center: AI Coach Button & Color Mix */}
        <div className="flex items-center gap-4 pointer-events-auto">
           <button
             onClick={toggleVoice}
             disabled={isConnecting}
             className={`flex items-center gap-2 px-5 py-3 rounded-full font-bold text-xs uppercase tracking-widest transition-all backdrop-blur-xl border shadow-2xl ${
               isVoiceActive 
                 ? 'bg-blue-600/90 border-blue-400 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]' 
                 : 'bg-zinc-900/80 border-white/10 hover:bg-zinc-800 text-zinc-300'
             } ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
           >
             {isConnecting ? (
               <Loader2 className="w-4 h-4 animate-spin" />
             ) : isVoiceActive ? (
               <Mic className="w-4 h-4" />
             ) : (
               <MicOff className="w-4 h-4" />
             )}
             {isConnecting ? 'Connecting...' : isVoiceActive ? 'Voice Active' : 'Start Assistant'}
           </button>
           
           <div className="flex items-center gap-4 bg-zinc-900/80 backdrop-blur-xl border border-white/10 p-2 pr-6 rounded-full shadow-2xl">
              <div 
                ref={mixColorRef}
                className="w-8 h-8 rounded-full border-2 border-white/20 shadow-md transition-colors duration-75" 
                style={{ backgroundColor: rgbToHex(COLORS[0].r, COLORS[0].g, COLORS[0].b) }} 
              />
              <div className="flex flex-col">
                <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">Current Mix</span>
                <span ref={mixTextRef} className="text-sm font-bold tracking-widest text-zinc-200">
                  {getColorName(COLORS[0].r, COLORS[0].g, COLORS[0].b)}
                </span>
              </div>
           </div>
        </div>

        {/* Top Right: AI Coach Chat */}
        <div className="pointer-events-auto relative">
           <button onClick={() => setChatOpen(!chatOpen)} className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors backdrop-blur-xl border shadow-2xl ${chatOpen ? 'bg-blue-600 text-white border-blue-400' : 'bg-zinc-900/80 text-blue-400 border-white/10 hover:bg-zinc-800'}`}>
              <MessageSquare className="w-5 h-5" />
           </button>
           {chatOpen && (
             <div className="absolute top-16 right-0 w-80 bg-zinc-900/95 backdrop-blur-2xl border border-white/10 rounded-3xl flex flex-col shadow-2xl overflow-hidden" style={{ height: '400px' }}>
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                   <h3 className="font-bold text-xs tracking-widest uppercase text-blue-400">Daily Challenge</h3>
                   <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${dailyChallenge.completed ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                      {dailyChallenge.completed ? 'COMPLETED' : 'IN PROGRESS'}
                   </span>
                </div>
                <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                   {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                         <div className={`px-4 py-2 rounded-2xl text-sm max-w-[90%] ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white/10 text-zinc-200 rounded-tl-sm border border-white/5'}`}>
                            {msg.text}
                         </div>
                      </div>
                   ))}
                   {isChatLoading && (
                      <div className="flex items-start">
                         <div className="px-4 py-2 rounded-2xl text-sm bg-white/10 text-zinc-400 rounded-tl-sm border border-white/5 flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Coach is thinking...
                         </div>
                      </div>
                   )}
                </div>
                <div className="p-3 border-t border-white/10 bg-black/20">
                   <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
                      <input 
                         type="text" 
                         value={chatInput} 
                         onChange={e => setChatInput(e.target.value)} 
                         placeholder="Ask for feedback..." 
                         className="flex-1 bg-white/5 text-white px-4 py-2.5 rounded-full text-sm outline-none focus:ring-1 focus:ring-blue-500 border border-white/10 placeholder:text-zinc-500 transition-all"
                      />
                      <button type="submit" disabled={!chatInput.trim() || isChatLoading} className="p-2.5 rounded-full bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-500 transition-colors">
                         <Pipette className="w-4 h-4 rotate-180" />
                      </button>
                   </form>
                </div>
             </div>
           )}
        </div>
      </motion.header>

      {/* Floating Toolbar (Left) */}
      <motion.aside 
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
        className="absolute left-6 top-1/2 -translate-y-1/2 bg-zinc-900/80 backdrop-blur-xl border border-white/10 p-3 rounded-3xl flex flex-col items-center gap-3 z-20 shadow-2xl"
      >
        <ToolButton icon={<Paintbrush className="w-5 h-5" />} label="Paint" active={tool === 'paint'} onClick={() => setTool('paint')} />
        {isUnlocked('water') && <ToolButton icon={<Droplet className="w-5 h-5" />} label="Water" active={tool === 'water'} onClick={() => setTool('water')} />}
        {isUnlocked('blend') && <ToolButton icon={<Layers className="w-5 h-5" />} label="Blend" active={tool === 'blend'} onClick={() => setTool('blend')} />}
        {isUnlocked('smudge') && <ToolButton icon={<Hand className="w-5 h-5" />} label="Smudge" active={tool === 'smudge'} onClick={() => setTool('smudge')} />}
        {isUnlocked('knife') && <ToolButton icon={<Flame className="w-5 h-5" />} label="Knife" active={tool === 'knife'} onClick={() => setTool('knife')} />}
        <ToolButton icon={<Eraser className="w-5 h-5" />} label="Eraser" active={tool === 'eraser'} onClick={() => setTool('eraser')} />
        {isUnlocked('picker') && <ToolButton icon={<Pipette className="w-5 h-5" />} label="Picker" active={tool === 'picker'} onClick={() => setTool('picker')} />}
        
        <div className="w-8 h-px bg-white/10 my-1" />
        
        <ToolButton icon={<RotateCcw className="w-5 h-5" />} label="Undo" onClick={handleUndo} />
        <ToolButton icon={<RotateCcw className="w-5 h-5 scale-x-[-1]" />} label="Redo" onClick={handleRedo} />
        <ToolButton icon={<Activity className="w-5 h-5" />} label="Pressure" active={usePressure} onClick={() => setUsePressure(prev => !prev)} />
        <ToolButton icon={<Split className="w-5 h-5" />} label="Symmetry" active={symmetryMode} onClick={() => setSymmetryMode(prev => !prev)} />
        <ToolButton icon={<Eraser className="w-5 h-5 text-red-400" />} label="Clear" onClick={clearCanvas} />
        <ToolButton icon={<Download className="w-5 h-5" />} label="Save" onClick={saveCanvas} />
      </motion.aside>

      {/* Floating Size Slider */}
      <motion.div 
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.15 }}
        className="absolute left-32 top-1/2 -translate-y-1/2 bg-zinc-900/80 backdrop-blur-xl border border-white/10 py-6 px-3 rounded-full flex flex-col items-center gap-6 z-20 shadow-2xl"
      >
        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Size</span>
        <div className="relative h-40 flex items-center justify-center w-full">
          <input 
            type="range" 
            min="5" 
            max="150" 
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-40 -rotate-90 appearance-none bg-black/50 h-1.5 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-ns-resize absolute"
          />
        </div>
        <span className="text-xs font-mono text-zinc-300">{brushSize}px</span>
      </motion.div>

      {/* Floating Palette (Bottom) */}
      <motion.footer 
        initial={{ y: 100, opacity: 0, x: "-50%" }}
        animate={{ y: 0, opacity: 1, x: "-50%" }}
        transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.2 }}
        className="absolute bottom-6 left-1/2 bg-zinc-900/80 backdrop-blur-xl border border-white/10 p-4 rounded-3xl flex flex-col z-20 shadow-2xl w-full max-w-4xl mx-auto"
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[9px] text-zinc-400 font-bold tracking-[0.2em] uppercase">Pigments</span>
          <div className="h-px flex-1 bg-white/5"></div>
        </div>
        <div className="flex-1 overflow-x-auto overflow-y-hidden flex flex-wrap gap-2 items-start content-start max-h-32 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
           {COLORS.map((c, i) => {
             const hex = rgbToHex(c.r, c.g, c.b);
             const isActive = activeColor === c;
             return (
               <button 
                 key={i}
                 onClick={() => handleColorSelect(c)}
                 className={`w-7 h-7 rounded-full transition-all duration-150 shadow-inner ${isActive ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-zinc-900 z-10' : 'hover:scale-110 border border-white/10'}`}
                 style={{ backgroundColor: hex }}
                 title={hex}
               />
             )
           })}
        </div>
      </motion.footer>

      {/* Dynamic Brush Cursor Indicator */}
      <div 
        ref={cursorRef}
        className="fixed pointer-events-none z-50 transition-opacity duration-75"
        style={{ display: 'none', width: '32px', height: '32px', transform: 'translate(-50%, -50%)', transformOrigin: 'center' }}
      >
        <div className="cursor-ring absolute top-0 left-0 w-full h-full rounded-full border-[1.5px] border-white/80 backdrop-blur-[2px]" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease, border-width 0.1s ease' }} />
      </div>

      {/* Gallery Modal */}
      <AnimatePresence>
      {showGallery && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-8"
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="bg-zinc-900/90 border border-white/10 rounded-3xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
              <h2 className="text-xl font-bold tracking-wider uppercase text-zinc-100">Session Gallery</h2>
              <button 
                onClick={() => setShowGallery(false)}
                className="text-zinc-400 hover:text-white transition-colors uppercase text-xs font-bold tracking-widest px-4 py-2 rounded-full hover:bg-white/10"
              >
                Close
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8">
              {savedArtworks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-4">
                  <Layers className="w-16 h-16 opacity-30" />
                  <p className="text-sm tracking-widest uppercase font-bold">No artworks saved yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {savedArtworks.map((src, i) => (
                     <div key={i} className="group relative aspect-video bg-black/50 rounded-2xl overflow-hidden border border-white/5 hover:border-white/20 transition-all hover:scale-105 shadow-xl">
                      <img src={src} className="w-full h-full object-contain" alt="Saved Artwork" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button 
                          onClick={() => {
                            const link = document.createElement('a');
                            link.download = `promix-masterpiece-${i}.png`;
                            link.href = src;
                            link.click();
                          }}
                          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-full text-xs font-bold uppercase tracking-widest text-white shadow-lg flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" /> Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Profile & Leaderboard Modal */}
      <AnimatePresence>
      {showProfile && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-8"
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="bg-zinc-900/90 border border-white/10 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
              <h2 className="text-xl font-bold tracking-wider uppercase text-zinc-100 flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm">L{level}</div>
                 Artist Profile
              </h2>
              <button 
                onClick={() => setShowProfile(false)}
                className="text-zinc-400 hover:text-white transition-colors uppercase text-xs font-bold tracking-widest px-4 py-2 rounded-full hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 flex flex-col md:flex-row gap-12">
               <div className="flex-1 space-y-8">
                  <div>
                     <h3 className="text-xs uppercase font-bold tracking-widest text-zinc-500 mb-4">Your Stats</h3>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="bg-black/30 border border-white/5 p-4 rounded-2xl flex flex-col">
                           <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Total XP</span>
                           <span className="text-2xl font-mono text-zinc-200 mt-1">{xp}</span>
                        </div>
                        <div className="bg-black/30 border border-white/5 p-4 rounded-2xl flex flex-col">
                           <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Current Level</span>
                           <span className="text-2xl font-mono text-zinc-200 mt-1">{level}</span>
                        </div>
                        <div className="bg-black/30 border border-white/5 p-4 rounded-2xl flex flex-col col-span-2">
                           <span className="text-[10px] uppercase font-bold tracking-widest text-orange-500 flex items-center gap-1"><Flame className="w-3 h-3" /> Streak</span>
                           <span className="text-2xl font-mono text-orange-400 mt-1">{Math.floor(level/2)} Days</span>
                        </div>
                     </div>
                  </div>
                  <div>
                     <h3 className="text-xs uppercase font-bold tracking-widest text-zinc-500 mb-4">Unlocked Tools</h3>
                     <div className="flex flex-wrap gap-2">
                        {['paint', 'eraser', 'blend', 'picker', 'smudge', 'knife', 'water'].map(t => (
                           <div key={t} className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border ${isUnlocked(t) ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'bg-white/5 text-zinc-600 border-white/5'}`}>
                              {t}
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
               <div className="w-px bg-white/10 hidden md:block" />
               <div className="flex-1">
                  <h3 className="text-xs uppercase font-bold tracking-widest text-green-400 mb-4 flex items-center gap-2">
                     <Activity className="w-4 h-4" /> Global Top Mixers
                  </h3>
                  <div className="flex flex-col gap-3">
                     {[
                       { name: 'Alex M.', streak: 42, points: 8400 },
                       { name: 'Sarah J.', streak: 38, points: 7600 },
                       { name: 'David K.', streak: 29, points: 5800 },
                       { name: 'You', streak: Math.floor(level/2), points: xp }
                     ].sort((a, b) => b.points - a.points).map((user, i) => (
                        <div key={i} className={`flex items-center justify-between p-4 rounded-2xl border ${user.name === 'You' ? 'bg-blue-600/10 border-blue-500/30 text-blue-300' : 'bg-black/30 border-white/5 text-zinc-300'}`}>
                           <div className="flex items-center gap-4">
                              <span className="opacity-50 font-mono text-sm">{i + 1}.</span>
                              <span className="font-bold">{user.name}</span>
                           </div>
                           <div className="flex items-center gap-4">
                              <span className="font-mono text-xs opacity-70">{user.points} XP</span>
                              <span className="font-mono text-orange-400 font-bold bg-orange-500/10 px-2 py-1 rounded-md">{user.streak} <Flame className="w-3 h-3 inline-block -mt-0.5" /></span>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Level Up Notification */}
      <AnimatePresence>
      {levelUp !== null && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8, y: 50 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
        >
           <div className="bg-gradient-to-br from-blue-600/90 to-purple-700/90 backdrop-blur-xl border border-white/20 p-12 rounded-[3rem] flex flex-col items-center text-white shadow-[0_0_100px_rgba(59,130,246,0.5)]">
              <Flame className="w-16 h-16 text-orange-300 mb-6 animate-pulse" />
              <h2 className="text-sm font-bold tracking-[0.5em] uppercase text-blue-200 mb-2">Level Up</h2>
              <div className="text-8xl font-black tracking-tighter mb-4">{levelUp}</div>
              <p className="text-sm font-bold tracking-widest text-purple-200 uppercase">New tools unlocked!</p>
           </div>
        </motion.div>
      )}
      </AnimatePresence>

    </div>
  );
}

function ToolButton({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all duration-200 ${
        active 
          ? 'bg-zinc-800 text-white shadow-lg scale-105' 
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
      }`}
      title={label}
    >
      {icon}
      <span className="text-[9px] uppercase font-bold tracking-widest">{label}</span>
    </button>
  );
}

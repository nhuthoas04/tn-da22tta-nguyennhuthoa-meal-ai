'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HiMicrophone, HiX, HiVolumeUp, HiVolumeOff, HiSparkles } from 'react-icons/hi';
import { chatbotAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

type AssistantState =
  | 'DISABLED'              // Off
  | 'WAKE_WORD_WAITING'     // Passive listening for "MealAI"
  | 'LISTENING_COMMAND'     // Active listening for user command
  | 'PROCESSING'            // Backend processing
  | 'SPEAKING'              // TTS feedback
  | 'WAITING_CONFIRMATION'; // Waiting for yes/no

export default function VoiceAssistantButton() {
  const router = useRouter();
  const [state, setState] = useState<AssistantState>('DISABLED');
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const stateRef = useRef<AssistantState>('DISABLED');
  const pendingCommandRef = useRef<string>('');
  const recordingStartTimeRef = useRef<number>(0);
  const isRecognitionRunningRef = useRef(false);
  const isMutedRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Sync refs
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const isSuspendedRef = useRef(false);

  // Safe start/stop for recognition
  const startRecognition = useCallback(() => {
    if (isSuspendedRef.current || !recognitionRef.current || isRecognitionRunningRef.current) return;
    try {
      recognitionRef.current.start();
      isRecognitionRunningRef.current = true;
    } catch (e) {
      console.warn('[Voice AI] Recognition start failed:', e);
    }
  }, []);

  const stopRecognition = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.abort();
    } catch (e) {
      // Not running
    }
    isRecognitionRunningRef.current = false;
  }, []);

  // Play short programmatic double-beep chirp sound using Web Audio API
  const playChirpSound = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      // Tone 1: Short low chime (600Hz, 80ms)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(600, ctx.currentTime);
      gain1.gain.setValueAtTime(0.08, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.08);
      
      // Tone 2: Short high chime (850Hz, 100ms) - starts slightly after Tone 1
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(850, ctx.currentTime + 0.06);
      gain2.gain.setValueAtTime(0.08, ctx.currentTime + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      osc2.start(ctx.currentTime + 0.06);
      osc2.stop(ctx.currentTime + 0.16);
    } catch (e) {
      console.warn('[Voice AI] Audio chime failed:', e);
    }
  }, []);

  // CPU saving: Suspend and Resume functions
  const suspendRecognition = useCallback(() => {
    if (stateRef.current !== 'DISABLED' && !isSuspendedRef.current) {
      isSuspendedRef.current = true;
      console.log('[Voice AI] Tab ẩn: Tạm ngắt nhận diện giọng nói để tiết kiệm CPU.');
      stopRecognition();
    }
  }, [stopRecognition]);

  const resumeRecognition = useCallback(() => {
    if (isSuspendedRef.current) {
      isSuspendedRef.current = false;
      console.log('[Voice AI] Tab hiện: Khôi phục nhận diện giọng nói.');
      setState('WAKE_WORD_WAITING');
      stateRef.current = 'WAKE_WORD_WAITING';
      startRecognition();
    }
  }, [startRecognition]);

  // Tab visibility listener
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleVisibility = () => {
      if (document.hidden) {
        suspendRecognition();
      } else {
        resumeRecognition();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [suspendRecognition, resumeRecognition]);

  // Handle Web Speech API Fallback
  const speakTextWebSpeech = useCallback((text: string, onEnd?: () => void) => {
    if (isMutedRef.current || !synthRef.current) {
      if (onEnd) setTimeout(onEnd, 300);
      return;
    }

    synthRef.current.cancel();

    const cleanText = text
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/[-•]\s*/g, '')
      .replace(/✓/g, 'Đã giữ nguyên')
      .substring(0, 500)
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'vi-VN';

    const voices = synthRef.current.getVoices();
    const viVoice = voices.find((v) => v.lang.includes('vi'));
    if (viVoice) {
      utterance.voice = viVoice;
    }

    utterance.onend = () => {
      if (onEnd) onEnd();
    };
    utterance.onerror = () => {
      if (onEnd) onEnd();
    };

    synthRef.current.speak(utterance);
  }, []);

  // Handle Natural Text-To-Speech with Fallback
  const speakText = useCallback(async (text: string, onEnd?: () => void) => {
    if (isMutedRef.current) {
      if (onEnd) setTimeout(onEnd, 300);
      return;
    }

    const cleanText = text
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/[-•]\s*/g, '')
      .replace(/✓/g, 'Đã giữ nguyên')
      .substring(0, 500)
      .trim();

    try {
      const response = await chatbotAPI.getTtsAudio(cleanText);
      const audioUrl = URL.createObjectURL(response.data);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (onEnd) onEnd();
      };
      
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        speakTextWebSpeech(cleanText, onEnd);
      };
      
      await audio.play();
    } catch (e) {
      console.warn('[Voice AI] Natural TTS failed, falling back to Web Speech API:', e);
      speakTextWebSpeech(cleanText, onEnd);
    }
  }, [speakTextWebSpeech]);

  // Handle client-side actions based on AI intents
  const handleClientAction = useCallback((actionTaken: any) => {
    if (!actionTaken || !actionTaken.name) return;

    const name = actionTaken.name;
    const args = actionTaken.args || {};
    
    console.log(`[Voice AI] Performing UI action: ${name}`, args);

    switch (name) {
      case 'navigate_to':
        const page = args.page;
        let path = '/';
        if (page === 'inventory') path = '/inventory';
        else if (page === 'meal-planner') path = '/meal-planner';
        else if (page === 'shopping-list') path = '/shopping-list';
        else if (page === 'recipes') path = '/recipes';
        else if (page === 'profile') path = '/profile';
        else if (page === 'nutrition') path = '/nutrition';
        else if (page === 'voice-dashboard') path = '/admin/voice-dashboard';
        
        router.push(path);
        break;

      case 'search_recipes':
        if (args.search) {
          router.push(`/recipes?search=${encodeURIComponent(args.search)}`);
        } else {
          router.push('/recipes');
        }
        break;

      case 'get_recipe_detail':
        if (args.recipeId) {
          router.push(`/recipes/${args.recipeId}`);
        }
        break;

      case 'get_inventory':
      case 'get_expiring_items':
        router.push('/inventory');
        break;

      case 'generate_meal_plan':
      case 'get_meal_plan':
      case 'generate_meal_plan_for_days':
      case 'add_to_meal_plan':
      case 'remove_from_meal_plan':
      case 'delete_meal_plan':
        router.push('/meal-planner');
        break;

      case 'get_shopping_lists':
      case 'generate_shopping_list':
        router.push('/shopping-list');
        break;

      case 'calculate_calories':
        router.push('/nutrition');
        break;
        
      case 'update_user_preferences':
        window.dispatchEvent(new Event('profile-updated'));
        break;

      default:
        break;
    }
  }, [router]);

  // Call backend to execute chatbot message
  const executeCommand = useCallback(async (cmdText: string) => {
    setState('PROCESSING');
    stopRecognition();
    const duration = recordingStartTimeRef.current > 0 ? Date.now() - recordingStartTimeRef.current : 3000;

    try {
      const res = await chatbotAPI.sendVoiceMessage(cmdText, duration);
      const textResponse = res.data?.text || 'Đã thực hiện câu lệnh.';
      const actionTaken = res.data?.actionTaken;
      setAiResponse(textResponse);

      // Perform UI actions first (if any) before/during speaking
      if (actionTaken) {
        handleClientAction(actionTaken);
      }

      setState('SPEAKING');
      speakText(textResponse, () => {
        // Dispatch events for UI reloading
        window.dispatchEvent(new Event('mealplan-updated'));
        window.dispatchEvent(new Event('inventory-updated'));
        window.dispatchEvent(new Event('shoppinglist-updated'));

        if (!isSuspendedRef.current) {
          setState('WAKE_WORD_WAITING');
          startRecognition();
        }
      });
    } catch (err) {
      console.warn('[Voice AI] Command error:', err);
      setState('SPEAKING');
      speakText('Xin lỗi, tôi đã gặp lỗi khi xử lý câu lệnh thoại của bạn.', () => {
        if (!isSuspendedRef.current) {
          setState('WAKE_WORD_WAITING');
          startRecognition();
        }
      });
    }
  }, [speakText, handleClientAction, startRecognition, stopRecognition]);

  // Captured confirmation
  const handleConfirmationCaptured = useCallback((confirmText: string) => {
    stopRecognition();
    const isAgree = confirmText.includes('xác nhận') ||
                    confirmText.includes('đồng ý') ||
                    confirmText.includes('có') ||
                    confirmText.includes('đúng vậy');

    if (isAgree) {
      const cmdToRun = pendingCommandRef.current;
      pendingCommandRef.current = '';
      executeCommand(cmdToRun);
    } else {
      pendingCommandRef.current = '';
      setState('SPEAKING');
      speakText('Đã hủy yêu cầu.', () => {
        if (!isSuspendedRef.current) {
          setState('WAKE_WORD_WAITING');
          startRecognition();
        }
      });
    }
  }, [executeCommand, speakText, startRecognition, stopRecognition]);

  // Captured command, check dangerous triggers
  const handleCommandCaptured = useCallback(async (cmdText: string) => {
    stopRecognition();

    const dangerousKeywords = [
      'xóa thực đơn',
      'xóa kế hoạch ăn',
      'xóa nguyên liệu',
      'xóa tủ lạnh',
      'xóa danh sách mua sắm',
      'tạo lại thực đơn',
      'ghi đè thực đơn',
    ];

    const isDangerous = dangerousKeywords.some((kw) => cmdText.includes(kw));

    if (isDangerous) {
      pendingCommandRef.current = cmdText;
      setState('SPEAKING');
      const actionLabel = cmdText.includes('xóa thực đơn') ? 'xóa thực đơn' :
                          cmdText.includes('tạo lại thực đơn') ? 'tạo lại thực đơn' :
                          cmdText.includes('xóa nguyên liệu') ? 'xóa nguyên liệu trong tủ lạnh' :
                          cmdText.includes('xóa danh sách mua sắm') ? 'xóa danh sách đi chợ' : 'thực hiện hành động này';

      speakText(`Bạn có chắc chắn muốn ${actionLabel} không?`, () => {
        if (!isSuspendedRef.current) {
          setState('WAITING_CONFIRMATION');
          startRecognition();
        }
      });
    } else {
      executeCommand(cmdText);
    }
  }, [executeCommand, speakText, startRecognition, stopRecognition]);

  // Passive wake word action
  const handleWakeWordTrigger = useCallback(() => {
    stopRecognition();
    playChirpSound();
    setState('LISTENING_COMMAND');
    stateRef.current = 'LISTENING_COMMAND';
    recordingStartTimeRef.current = Date.now();
    setTranscript('');
    
    // Start active command listening immediately
    setTimeout(() => {
      if (stateRef.current === 'LISTENING_COMMAND' && !isSuspendedRef.current) {
        startRecognition();
      }
    }, 100);
  }, [playChirpSound, startRecognition, stopRecognition]);

  // Initialize Speech Recognition & Synthesis
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    synthRef.current = window.speechSynthesis;

    // Preload voices (some browsers lazy-load)
    if (synthRef.current) {
      synthRef.current.getVoices();
      synthRef.current.onvoiceschanged = () => {
        synthRef.current?.getVoices();
      };
    }

    // Load configurations from localStorage
    const savedMuted = localStorage.getItem('voiceSpeechMuted');
    if (savedMuted !== null) {
      setIsMuted(savedMuted === 'true');
      isMutedRef.current = savedMuted === 'true';
    }

    // Configure Speech Recognition
    const rec = new SpeechRecognition();
    rec.lang = 'vi-VN';
    rec.continuous = false; // Process one result at a time to avoid conflicts
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      isRecognitionRunningRef.current = true;
    };

    rec.onresult = (event: any) => {
      const text = event.results[0]?.[0]?.transcript?.toLowerCase()?.trim() || '';
      const currentState = stateRef.current;
      console.log(`[Voice AI] State: ${currentState}, Heard: "${text}"`);

      if (!text || text.length < 2) return;

      if (currentState === 'WAKE_WORD_WAITING') {
        const cleanText = text.toLowerCase().trim();
        const wakeWords = ['mealai', 'meal ai', 'mì lai', 'meo ai', 'he meo lai', 'hey mealai', 'hey meal ai', 'hey meo ai', 'mì ai', 'hey bro', 'he bro', 'hi bro'];
        
        // Anti-false trigger: wake word phrases must be short to prevent background noise triggers
        const isWakeWordMatched = wakeWords.some(ww => cleanText.includes(ww)) && cleanText.length < 20;
        
        if (isWakeWordMatched) {
          handleWakeWordTrigger();
          return; // Don't restart - handleWakeWordTrigger manages flow
        }
      } else if (currentState === 'LISTENING_COMMAND') {
        setTranscript(text);
        handleCommandCaptured(text);
        return; // Don't restart - handleCommandCaptured manages flow
      } else if (currentState === 'WAITING_CONFIRMATION') {
        handleConfirmationCaptured(text);
        return; // Don't restart - handleConfirmationCaptured manages flow
      }
    };

    rec.onend = () => {
      isRecognitionRunningRef.current = false;
      
      // If recognition is suspended (background tab), do not auto-reconnect
      if (isSuspendedRef.current) return;

      const currentState = stateRef.current;
      if (currentState === 'WAKE_WORD_WAITING' || currentState === 'LISTENING_COMMAND' || currentState === 'WAITING_CONFIRMATION') {
        // Delay slightly (300ms) to avoid rapid restart loops in case of network drops
        setTimeout(() => {
          const latestState = stateRef.current;
          if (!isSuspendedRef.current && (latestState === 'WAKE_WORD_WAITING' || latestState === 'LISTENING_COMMAND' || latestState === 'WAITING_CONFIRMATION')) {
            try {
              rec.start();
              isRecognitionRunningRef.current = true;
            } catch (e) {
              // Already running or error
            }
          }
        }, 300);
      }
    };

    rec.onerror = (err: any) => {
      isRecognitionRunningRef.current = false;
      console.warn('[Voice AI] Error:', err.error);
      if (err.error === 'not-allowed') {
        toast.error('Trình duyệt không cho phép truy cập microphone. Vui lòng cấp quyền trong cài đặt trình duyệt.', { id: 'voice-permission-error' });
        setState('DISABLED');
        stateRef.current = 'DISABLED';
        localStorage.setItem('voiceAssistantEnabled', 'false');
        return;
      }
      if (err.error === 'network') {
        toast.error('Nhận diện giọng nói gặp lỗi kết nối mạng.', { id: 'voice-network-error' });
      }
      // For 'no-speech' and 'aborted', onend will handle restart
    };

    recognitionRef.current = rec;

    // Auto-enable from saved state
    const savedEnabled = localStorage.getItem('voiceAssistantEnabled');
    if (savedEnabled === 'true') {
      setState('WAKE_WORD_WAITING');
      stateRef.current = 'WAKE_WORD_WAITING';
      try {
        rec.start();
        isRecognitionRunningRef.current = true;
      } catch (e) {}
    }

    return () => {
      try { rec.abort(); } catch (e) {}
      isRecognitionRunningRef.current = false;
      if (synthRef.current) synthRef.current.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleCommandCaptured, handleConfirmationCaptured, handleWakeWordTrigger, startRecognition]);

  // Web Audio API visualizer for voice command listening
  useEffect(() => {
    if (state !== 'LISTENING_COMMAND') {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;
      }
      if (audioContextRef.current) {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
        audioContextRef.current = null;
      }
      return;
    }

    const initVisualizer = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyserRef.current = analyser;
        source.connect(analyser);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        canvas.width = canvas.offsetWidth || 240;
        canvas.height = canvas.offsetHeight || 32;

        let phase = 0;

        const draw = () => {
          if (stateRef.current !== 'LISTENING_COMMAND') return;
          animationFrameRef.current = requestAnimationFrame(draw);

          analyser.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;
          const volume = average / 255.0;

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const width = canvas.width;
          const height = canvas.height;
          const midY = height / 2;

          phase += 0.15;

          const waves = [
            { amplitude: volume * 18 + 2, frequency: 0.03, color: 'rgba(16, 185, 129, 0.65)', speed: 1 },
            { amplitude: volume * 12 + 1, frequency: 0.05, color: 'rgba(20, 184, 166, 0.45)', speed: -0.8 },
            { amplitude: volume * 8 + 0.5, frequency: 0.02, color: 'rgba(59, 130, 246, 0.35)', speed: 1.2 },
            { amplitude: volume * 5 + 0.2, frequency: 0.07, color: 'rgba(239, 68, 68, 0.25)', speed: -0.5 },
          ];

          waves.forEach(w => {
            ctx.beginPath();
            ctx.strokeStyle = w.color;
            ctx.lineWidth = 1.5;

            for (let x = 0; x < width; x++) {
              const normalizedX = x / width;
              const envelope = Math.sin(normalizedX * Math.PI);
              const y = midY + Math.sin(x * w.frequency + phase * w.speed) * w.amplitude * envelope;

              if (x === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
            }
            ctx.stroke();
          });
        };

        draw();
      } catch (err) {
        console.warn('[Voice AI] Visualizer setup failed:', err);
      }
    };

    const t = setTimeout(initVisualizer, 100);
    return () => {
      clearTimeout(t);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [state]);

  // Toggle Assistant ON/OFF
  const handleToggleAssistant = () => {
    if (!supported) {
      toast.error('Trình duyệt của bạn không hỗ trợ Web Speech API tiếng Việt.');
      return;
    }

    if (state === 'DISABLED') {
      setState('WAKE_WORD_WAITING');
      stateRef.current = 'WAKE_WORD_WAITING';
      localStorage.setItem('voiceAssistantEnabled', 'true');
      toast.success('Voice Assistant đã được kích hoạt. Hãy nói "MealAI" hoặc click micro để ra lệnh!');
      startRecognition();
    } else {
      setState('DISABLED');
      stateRef.current = 'DISABLED';
      localStorage.setItem('voiceAssistantEnabled', 'false');
      stopRecognition();
      if (synthRef.current) synthRef.current.cancel();
      setTranscript('');
      setAiResponse('');
      toast('Đã tắt Voice Assistant');
    }
  };

  // Toggle Mute Speech Response
  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    isMutedRef.current = newMuted;
    localStorage.setItem('voiceSpeechMuted', String(newMuted));
    if (newMuted && synthRef.current) {
      synthRef.current.cancel();
    }
    toast(newMuted ? 'Đã tắt giọng nói phản hồi' : 'Đã bật giọng nói phản hồi');
  };

  // Click microphone directly to speak command without wake word
  const handleDirectActivate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!supported) return;

    // If currently disabled, enable first
    if (state === 'DISABLED') {
      setState('WAKE_WORD_WAITING');
      stateRef.current = 'WAKE_WORD_WAITING';
      localStorage.setItem('voiceAssistantEnabled', 'true');
    }

    // Stop any ongoing recognition first
    stopRecognition();
    if (synthRef.current) synthRef.current.cancel();

    setState('SPEAKING');
    stateRef.current = 'SPEAKING';
    speakText('Tôi đang nghe', () => {
      setState('LISTENING_COMMAND');
      stateRef.current = 'LISTENING_COMMAND';
      recordingStartTimeRef.current = Date.now();
      setTranscript('');
      startRecognition();
    });
  };

  // Label text for status
  const getStateLabel = () => {
    switch (state) {
      case 'WAKE_WORD_WAITING':
        return 'Nói "MealAI" để kích hoạt';
      case 'LISTENING_COMMAND':
        return '🎤 Đang nghe câu lệnh...';
      case 'PROCESSING':
        return '🧠 AI đang xử lý...';
      case 'SPEAKING':
        return '🔊 AI đang trả lời...';
      case 'WAITING_CONFIRMATION':
        return '⚠️ Nói "Xác nhận" hoặc "Hủy"';
      default:
        return 'Voice Assistant Tắt';
    }
  };

  return (
    <div className="fixed bottom-24 right-6 z-50 flex flex-col items-end gap-3 select-none">
      {/* Floating Status Card */}
      {state !== 'DISABLED' && (
        <div
          className="bg-white/95 backdrop-blur-md border border-brand-light-border rounded-2xl p-3 shadow-brand-lg max-w-[280px] flex flex-col gap-2 items-center text-center"
          style={{ animation: 'slideInUp 0.3s ease-out' }}
        >
          <div className="flex items-center justify-between w-full border-b border-gray-100 pb-1.5 px-1">
            <span className="text-[10px] font-bold text-brand-primary uppercase tracking-wider flex items-center gap-1">
              <HiSparkles className="animate-pulse" /> Voice Trợ lý
            </span>
            <div className="flex items-center gap-1.5">
              {/* Mute Control */}
              <button
                onClick={handleToggleMute}
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                title={isMuted ? 'Bật giọng nói phản hồi' : 'Tắt giọng nói phản hồi'}
              >
                {isMuted ? <HiVolumeOff size={15} /> : <HiVolumeUp size={15} />}
              </button>
              <button
                onClick={handleToggleAssistant}
                className="p-1 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                title="Tắt Voice Assistant"
              >
                <HiX size={15} />
              </button>
            </div>
          </div>

          <span className="text-xs font-bold text-slate-700">
            {getStateLabel()}
          </span>

          {/* Sound waves animation */}
          {state === 'LISTENING_COMMAND' ? (
            <canvas ref={canvasRef} className="w-full h-8 my-1 rounded" style={{ minWidth: '200px' }} />
          ) : (state === 'SPEAKING' || state === 'WAITING_CONFIRMATION') ? (
            <div className="flex items-center gap-1.5 h-6 my-1">
              <span className={`w-1 h-3 rounded-full animate-bounce [animation-duration:0.6s] ${state === 'SPEAKING' ? 'bg-teal-500' : 'bg-brand-primary'}`} />
              <span className={`w-1 h-5 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.15s] ${state === 'SPEAKING' ? 'bg-teal-500' : 'bg-brand-primary'}`} />
              <span className={`w-1 h-6 rounded-full animate-bounce [animation-duration:0.5s] [animation-delay:0.3s] ${state === 'SPEAKING' ? 'bg-teal-500' : 'bg-brand-primary'}`} />
              <span className={`w-1 h-4 rounded-full animate-bounce [animation-duration:0.7s] [animation-delay:0.45s] ${state === 'SPEAKING' ? 'bg-teal-500' : 'bg-brand-primary'}`} />
              <span className={`w-1 h-2 rounded-full animate-bounce [animation-duration:0.9s] [animation-delay:0.6s] ${state === 'SPEAKING' ? 'bg-teal-500' : 'bg-brand-primary'}`} />
            </div>
          ) : state === 'PROCESSING' ? (
            <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin my-1.5" />
          ) : (
            <div className="h-1 w-12 bg-slate-100 rounded my-3" />
          )}

          {transcript && (state === 'LISTENING_COMMAND' || state === 'PROCESSING') && (
            <p className="text-[11px] italic text-slate-500 truncate max-w-[240px] px-1 bg-slate-50 rounded py-0.5 border border-slate-100">
              &ldquo;{transcript}&rdquo;
            </p>
          )}

          {aiResponse && state === 'SPEAKING' && (
            <p className="text-[10px] text-slate-500 line-clamp-2 max-w-[240px] px-1">
              {aiResponse.substring(0, 100)}{aiResponse.length > 100 ? '...' : ''}
            </p>
          )}
        </div>
      )}

      {/* Floating Microphone Button */}
      <button
        onClick={state === 'DISABLED' ? handleToggleAssistant : handleDirectActivate}
        className={`w-14 h-14 rounded-full shadow-brand-glow flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer relative group ${
          state === 'DISABLED'
            ? 'bg-slate-100 hover:bg-slate-200 text-slate-500 border border-slate-200'
            : state === 'LISTENING_COMMAND'
            ? 'bg-rose-500 hover:bg-rose-600 text-white animate-pulse'
            : state === 'WAITING_CONFIRMATION'
            ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse'
            : state === 'PROCESSING'
            ? 'bg-brand-primary text-white opacity-75'
            : 'bg-brand-primary hover:bg-brand-primary-hover text-white'
        }`}
        title={state === 'DISABLED' ? 'Bật Voice Assistant' : 'Bấm để ra lệnh giọng nói'}
        disabled={state === 'PROCESSING'}
      >
        <HiMicrophone className="w-6 h-6" />

        {/* Glow indicator for wake word */}
        {state === 'WAKE_WORD_WAITING' && (
          <span className="absolute inset-0 rounded-full border border-brand-primary animate-ping opacity-60 pointer-events-none" />
        )}
      </button>

      {/* CSS Animation */}
      <style jsx>{`
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

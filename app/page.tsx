'use client';

import { useState, useRef, useEffect } from 'react';
import { useDesktopDB, useDesktopDBAuth } from 'use-desktop-db';
import { v4 as uuidv4 } from 'uuid';
import { Send, Upload, Plus, MessageSquare, Loader2, FileText, Database, Settings, X, FolderOpen, ShieldCheck, Pin, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { generateTitle, askQuestion, ingestDocument, removeDocument, Provider } from './actions/rag';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  pinned?: boolean;
  attachedFiles?: string[];
};

type DBSessionStore = {
  id: string;
  sessions: ChatSession[];
};

const AVAILABLE_PROVIDERS: { id: Provider; name: string }[] = [
  { id: 'gemini', name: 'Google Gemini' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic Claude' },
  { id: 'groq', name: 'Groq (Llama 3)' },
  { id: 'together', name: 'Together AI' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'fireworks', name: 'Fireworks AI' },
  { id: 'perplexity', name: 'Perplexity' },
  { id: 'cohere', name: 'Cohere' },
  { id: 'mistral', name: 'Mistral AI' },
];

const MODELS_BY_PROVIDER: Record<Provider, { id: string, name: string, tier: string }[]> = {
  gemini: [
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', tier: 'Advanced' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tier: 'Mid' },
    { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B', tier: 'Fast' }
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', tier: 'Advanced' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', tier: 'Mid' }
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', tier: 'Advanced' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', tier: 'Fast' }
  ],
  groq: [
    { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B', tier: 'Advanced' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', tier: 'Fast' }
  ],
  together: [
    { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', name: 'Llama 3.1 70B', tier: 'Advanced' },
    { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', name: 'Llama 3.1 8B', tier: 'Fast' }
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat (V2)', tier: 'Advanced' },
    { id: 'deepseek-coder', name: 'DeepSeek Coder (V2)', tier: 'Mid' }
  ],
  fireworks: [
    { id: 'accounts/fireworks/models/llama-v3p1-70b-instruct', name: 'Llama 3.1 70B', tier: 'Advanced' },
    { id: 'accounts/fireworks/models/llama-v3p1-8b-instruct', name: 'Llama 3.1 8B', tier: 'Fast' }
  ],
  perplexity: [
    { id: 'llama-3.1-sonar-large-128k-chat', name: 'Sonar Large', tier: 'Advanced' },
    { id: 'llama-3.1-sonar-small-128k-chat', name: 'Sonar Small', tier: 'Fast' }
  ],
  cohere: [
    { id: 'command-r-plus', name: 'Command R+', tier: 'Advanced' },
    { id: 'command-r', name: 'Command R', tier: 'Fast' }
  ],
  mistral: [
    { id: 'mistral-large-latest', name: 'Mistral Large', tier: 'Advanced' },
    { id: 'open-mistral-nemo', name: 'Mistral Nemo', tier: 'Fast' }
  ]
};

export default function RAGChatApp() {
  // --- Auth & DB ---
  const { connect, isConnected, dirHandle } = useDesktopDBAuth();
  const { data: dbData, insert, update, isLoading: dbIsLoading } = useDesktopDB<DBSessionStore>('zvec-local-rag');

  // --- Settings State ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showReconnectModal, setShowReconnectModal] = useState(false);
  const [showOnboardingMessage, setShowOnboardingMessage] = useState(false);
  const [provider, setProvider] = useState<Provider>('gemini');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
  const [apiKey, setApiKey] = useState('');
  const [useDefaultKey, setUseDefaultKey] = useState(true);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [dbInitialized, setDbInitialized] = useState(false);

  // Load settings on mount and check onboarding status
  useEffect(() => {
    const savedProvider = localStorage.getItem('rag_provider');
    const savedModel = localStorage.getItem('rag_model');
    const savedKey = localStorage.getItem('rag_api_key');
    const savedUseDefault = localStorage.getItem('rag_use_default');
    const hasOnboarded = localStorage.getItem('rag_onboarded');
    
    if (savedProvider) setProvider(savedProvider as Provider);
    if (savedModel) setSelectedModel(savedModel);
    if (savedKey) setApiKey(savedKey);
    if (savedUseDefault !== null) setUseDefaultKey(savedUseDefault === 'true');

    if (!hasOnboarded) {
      setShowOnboarding(true);
    } else {
      setShowReconnectModal(true);
    }
  }, []);

  const finishOnboarding = () => {
    localStorage.setItem('rag_provider', provider);
    localStorage.setItem('rag_api_key', apiKey);
    localStorage.setItem('rag_use_default', useDefaultKey.toString());
    localStorage.setItem('rag_onboarded', 'true');
    setShowOnboarding(false);
    setShowOnboardingMessage(true);
    setTimeout(() => setShowOnboardingMessage(false), 5000);
  };

  const saveSettings = (newProvider: Provider, newKey: string, useDefault: boolean) => {
    setProvider(newProvider);
    setApiKey(newKey);
    setUseDefaultKey(useDefault);
    localStorage.setItem('rag_provider', newProvider);
    localStorage.setItem('rag_api_key', newKey);
    localStorage.setItem('rag_use_default', useDefault.toString());
    setIsSettingsOpen(false);
  };

  // Sync DB data to state once when loaded
  useEffect(() => {
    if (isConnected && !dbIsLoading && !dbInitialized) {
      if (dbData && dbData.length > 0) {
        // Load existing sessions
        const loadedSessions = dbData[0].sessions || [];
        setSessions(loadedSessions);
        if (loadedSessions.length > 0) {
          setActiveSessionId(loadedSessions[0].id);
        }
        setDbInitialized(true);
      } else {
        // Initialize new store
        insert({ id: 'main-store', sessions: [] })
          .then(() => setDbInitialized(true))
          .catch(e => console.error("Failed to initialize store:", e));
      }
    }
  }, [isConnected, dbIsLoading, dbInitialized, dbData, insert]);

  const handleConnectFolder = async () => {
    try {
      await connect();
      setShowReconnectModal(false);
    } catch (e) {
      console.error("Failed to connect folder:", e);
    }
  };

  // Save sessions to DB whenever they change (after initialization)
  useEffect(() => {
    if (dbInitialized && dbData && dbData.length > 0 && isConnected) {
      const timeoutId = setTimeout(() => {
        update('main-store', { sessions }).catch(e => {
          if (e.name !== 'InvalidStateError') console.error("Update failed:", e);
        });
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [sessions, dbInitialized, update, dbData, isConnected]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [sessions, activeSessionId]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const handleNewChat = () => {
    // Prevent creating multiple empty chats
    const hasEmptyChat = sessions.find(s => s.messages.length === 0);
    if (hasEmptyChat) {
      setActiveSessionId(hasEmptyChat.id);
      return;
    }

    const newSession: ChatSession = {
      id: uuidv4(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  const handlePinSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSessions(prev => prev.map(s => s.id === id ? { ...s, pinned: !s.pinned } : s));
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this chat?")) {
      setSessions(prev => {
        const next = prev.filter(s => s.id !== id);
        if (activeSessionId === id) {
          setActiveSessionId(next.length > 0 ? next[0].id : null);
        }
        return next;
      });
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!apiKey && !useDefaultKey) {
      alert("Please configure your API Key or enable the Default Free Key in Settings first.");
      setIsSettingsOpen(true);
      return;
    }

    const currentInput = input;
    setInput('');
    setIsLoading(true);

    let session = activeSession;
    let isNewSession = false;

    // Create session if none exists
    if (!session) {
      isNewSession = true;
      session = {
        id: uuidv4(),
        title: 'New Chat',
        messages: [],
        createdAt: Date.now(),
      };
      setActiveSessionId(session.id);
    }

    const userMessage: Message = { id: uuidv4(), role: 'user', content: currentInput };
    const updatedMessages = [...(session.messages || []), userMessage];

    // Update state optimistically
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== session!.id);
      return [{ ...session!, messages: updatedMessages }, ...filtered];
    });

    try {
      // 1. Get RAG Answer from Backend (passing credentials securely)
      const answer = await askQuestion(currentInput, updatedMessages, provider, apiKey, selectedModel, session.id);
      
      const assistantMessage: Message = { id: uuidv4(), role: 'assistant', content: answer };
      const finalMessages = [...updatedMessages, assistantMessage];

      // 2. Auto-Title generation if it's the first message
      let newTitle = session.title;
      if (session.messages.length === 0 || isNewSession) {
        const generatedTitle = await generateTitle(currentInput, provider, apiKey, selectedModel);
        if (generatedTitle) {
          newTitle = generatedTitle;
        }
      }

      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== session!.id);
        return [{ ...session!, title: newTitle, messages: finalMessages }, ...filtered];
      });
    } catch (error: any) {
      console.error('Error generating answer:', error);
      alert(`Error: ${error.message || 'Check your API key and try again.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!apiKey && !useDefaultKey) {
      alert("Please configure your API Key or enable the Default Free Key in Settings before uploading.");
      setIsSettingsOpen(true);
      return;
    }

    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      currentSessionId = uuidv4();
      const newSession: ChatSession = {
        id: currentSessionId,
        title: 'New Chat',
        messages: [],
        createdAt: Date.now(),
        attachedFiles: [],
      };
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(currentSessionId);
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Call server action to ingest with provider credentials and sessionId
      const result = await ingestDocument(formData, provider, apiKey, currentSessionId);
      if (result.success) {
        setSessions(prev => prev.map(s => s.id === currentSessionId ? {
          ...s,
          attachedFiles: [...(s.attachedFiles || []), file.name]
        } : s));
        // Save a copy of the file to the local directory if connected
        if (dirHandle) {
          try {
            const fileHandle = await (dirHandle as any).getFileHandle(file.name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(file);
            await writable.close();
          } catch (err) {
            console.error("Failed to save copy to local folder:", err);
            // Non-fatal error, so we still show success for ZVec ingestion
          }
        }
        alert(`Successfully indexed document in Zvec! Found ${result.chunks} chunks.`);
      } else {
        alert(`Failed to index document: ${result.error}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Error uploading document.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = async (fileName: string) => {
    if (!activeSessionId) return;
    
    // Optimistic update
    setSessions(prev => prev.map(s => s.id === activeSessionId ? {
      ...s,
      attachedFiles: s.attachedFiles?.filter(f => f !== fileName) || []
    } : s));

    const result = await removeDocument(activeSessionId, fileName);
    if (!result.success) {
      alert(`Failed to remove document vectors: ${result.error}`);
    }
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">
      
      {/* ONBOARDING MESSAGE TOAST */}
      {showOnboardingMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
          <ShieldCheck className="w-5 h-5" />
          <span className="font-medium">Welcome! You can change the configuration anytime from Settings.</span>
        </div>
      )}

      {/* ONBOARDING MODAL */}
      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="bg-card border border-border w-full max-w-xl p-8 rounded-3xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-purple-500 to-primary"></div>
            
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary/20">
                <Database className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">Welcome to Zvec RAG</h2>
              <p className="text-muted-foreground mt-2">Setup your local workspace to get started securely.</p>
            </div>
            
            <div className="space-y-6">
              {/* Step 1: Storage */}
              <div className="bg-secondary/40 border border-border p-5 rounded-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-bold flex items-center gap-2 mb-1">
                      <FolderOpen className="w-4 h-4 text-primary" /> Local Storage
                    </h3>
                    <p className="text-sm text-muted-foreground">Select a folder on your PC to securely save your chat history offline.</p>
                  </div>
                  <button 
                    onClick={handleConnectFolder}
                    disabled={isConnected}
                    className={cn(
                      "px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0",
                      isConnected ? "bg-green-500/20 text-green-500 border border-green-500/30" : "bg-primary text-white hover:bg-primary/90 shadow-lg"
                    )}
                  >
                    {isConnected ? "Connected ✓" : "Select Folder"}
                  </button>
                </div>
              </div>

              {/* Step 2: API Keys */}
              <div className="bg-secondary/40 border border-border p-5 rounded-2xl space-y-4">
                <h3 className="font-bold flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-4 h-4 text-primary" /> AI Provider
                </h3>
                
                <label className="flex items-center gap-3 cursor-pointer bg-background p-3 rounded-xl border border-border">
                  <input 
                    type="checkbox" 
                    checked={useDefaultKey}
                    onChange={(e) => setUseDefaultKey(e.target.checked)}
                    className="w-5 h-5 text-primary bg-background border-border rounded focus:ring-primary"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold">Use Default Free Gemini Key</span>
                    <span className="text-xs text-muted-foreground">Start chatting immediately with no setup.</span>
                  </div>
                </label>

                {!useDefaultKey && (
                  <div className="space-y-3 pt-2">
                    <select 
                      className="w-full bg-input border border-border rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary text-sm"
                      value={provider}
                      onChange={(e) => {
                        const newProvider = e.target.value as Provider;
                        setProvider(newProvider);
                        setSelectedModel(MODELS_BY_PROVIDER[newProvider][0].id);
                      }}
                    >
                      {AVAILABLE_PROVIDERS.map(p => (
                        <option key={p.id} value={p.id} style={{ backgroundColor: '#18181b', color: 'white' }}>{p.name}</option>
                      ))}
                    </select>
                    
                    <select 
                      className="w-full bg-input border border-border rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary text-sm"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                    >
                      {MODELS_BY_PROVIDER[provider].map(m => (
                        <option key={m.id} value={m.id} style={{ backgroundColor: '#18181b', color: 'white' }}>
                          {m.tier === 'Advanced' ? '🧠 Advanced' : m.tier === 'Mid' ? '⚖️ Balanced' : '⚡ Fast'} — {m.name}
                        </option>
                      ))}
                    </select>

                    <input 
                      type="password"
                      placeholder={`Enter your ${AVAILABLE_PROVIDERS.find(p => p.id === provider)?.name} API Key...`}
                      className="w-full bg-input border border-border rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-3 pt-4">
                <button 
                  onClick={finishOnboarding}
                  className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-xl py-3 font-bold transition-all"
                >
                  Skip for now
                </button>
                <button 
                  onClick={finishOnboarding}
                  className="flex-1 bg-gradient-to-r from-primary to-purple-500 hover:opacity-90 text-white rounded-xl py-3 font-bold shadow-lg transition-all"
                >
                  Get Started
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RECONNECT MODAL */}
      {showReconnectModal && !isConnected && !showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border w-full max-w-md p-6 rounded-2xl shadow-2xl relative">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-2">Reconnect Local Storage?</h2>
              <p className="text-sm text-muted-foreground">
                For your security, browsers require you to re-approve folder access when you refresh the page.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowReconnectModal(false)}
                className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-xl py-2.5 font-bold transition-all"
              >
                Skip for Session
              </button>
              <button 
                onClick={handleConnectFolder}
                className="flex-1 bg-primary text-white hover:bg-primary/90 rounded-xl py-2.5 font-bold shadow-lg transition-all"
              >
                Connect Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border w-full max-w-md p-6 rounded-2xl shadow-2xl relative">
            <button 
              onClick={() => setIsSettingsOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" /> API & Storage Settings
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Your API keys are stored securely in your browser's local storage and are only sent to the server when you make a request. They are never saved to a database.
            </p>
            
            <div className="space-y-4">
              
              {!isConnected && (
                <div className="bg-accent border border-primary/20 p-4 rounded-xl mb-2">
                  <p className="text-sm text-accent-foreground mb-3 font-medium">
                    You must re-connect your local folder to save chats.
                  </p>
                  <button 
                    onClick={handleConnectFolder}
                    className="w-full bg-primary hover:bg-primary/90 text-white rounded-lg py-2 text-sm font-bold shadow-lg transition-colors"
                  >
                    Connect Local Folder
                  </button>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer bg-secondary/50 p-3 rounded-lg border border-border">
                <input 
                  type="checkbox" 
                  checked={useDefaultKey}
                  onChange={(e) => setUseDefaultKey(e.target.checked)}
                  className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary"
                />
                <span className="text-sm font-medium">Use Default Free Gemini Key</span>
              </label>

              {!useDefaultKey && (
                <>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium mb-1">AI Provider</label>
                    <select 
                      className="w-full bg-input border border-border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary"
                      value={provider}
                      onChange={(e) => {
                        const newProvider = e.target.value as Provider;
                        setProvider(newProvider);
                        setSelectedModel(MODELS_BY_PROVIDER[newProvider][0].id);
                      }}
                    >
                      {AVAILABLE_PROVIDERS.map(p => (
                        <option key={p.id} value={p.id} style={{ backgroundColor: '#18181b', color: 'white' }}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium mb-1">AI Model</label>
                    <select 
                      className="w-full bg-input border border-border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                    >
                      {MODELS_BY_PROVIDER[provider].map(m => (
                        <option key={m.id} value={m.id} style={{ backgroundColor: '#18181b', color: 'white' }}>
                          {m.tier === 'Advanced' ? '🧠 Advanced' : m.tier === 'Mid' ? '⚖️ Balanced' : '⚡ Fast'} — {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">API Key</label>
                    <input 
                      type="password"
                      placeholder={`Enter your ${AVAILABLE_PROVIDERS.find(p => p.id === provider)?.name} API Key...`}
                      className="w-full bg-input border border-border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>
                </>
              )}
              
              <button 
                onClick={() => saveSettings(provider, apiKey, useDefaultKey)}
                className="w-full bg-primary hover:bg-primary/90 text-white rounded-lg py-2.5 font-medium transition-all mt-2"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTEXT MODAL */}
      {isContextModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border w-full max-w-lg p-6 rounded-3xl shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-purple-500"></div>
            
            <button 
              onClick={() => setIsContextModalOpen(false)}
              className="absolute top-5 right-5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" /> Context Files
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Manage the files attached to this specific chat. These files are used as context for the AI.
            </p>
            
            <div className="space-y-4">
              <div className="bg-secondary/30 rounded-2xl p-4 border border-border/50 max-h-60 overflow-y-auto custom-scrollbar">
                {!activeSession?.attachedFiles || activeSession.attachedFiles.length === 0 ? (
                  <div className="text-center py-6 opacity-70">
                    <Database className="w-10 h-10 mx-auto text-muted-foreground mb-3 opacity-50" />
                    <p className="text-sm font-medium">No files attached to this chat yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeSession.attachedFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/50 hover:border-primary/30 transition-colors group">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <FileText className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-medium truncate max-w-[200px] sm:max-w-[300px]">{file}</span>
                        </div>
                        <button 
                          onClick={() => handleRemoveFile(file)}
                          className="p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-lg transition-colors md:opacity-0 group-hover:opacity-100"
                          title="Remove file vectors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <button 
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                disabled={isUploading}
                className="w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl py-3 text-sm font-bold shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
                {isUploading ? 'Indexing...' : 'Upload New File'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <div className="w-80 flex-shrink-0 border-r border-border bg-popover/30 backdrop-blur-md flex flex-col transition-all duration-300">
        <div className="p-4 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2">
            <Database className="text-primary w-6 h-6" />
            <h1 className="font-bold text-xl tracking-tight bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">Zvec RAG</h1>
          </div>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
            {!isConnected && <span className="absolute top-4 right-4 w-2.5 h-2.5 bg-red-500 rounded-full"></span>}
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-secondary/50 hover:bg-secondary hover:border-primary/50 transition-all duration-200 text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
          {[...sessions]
            .sort((a, b) => {
              if (a.pinned && !b.pinned) return -1;
              if (!a.pinned && b.pinned) return 1;
              return b.createdAt - a.createdAt;
            })
            .map((session) => (
            <div
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-3 py-3 rounded-xl text-left transition-all duration-200 group cursor-pointer",
                activeSessionId === session.id 
                  ? "bg-primary/10 border border-primary/30 text-primary-foreground" 
                  : "hover:bg-secondary/40 text-muted-foreground hover:text-foreground border border-transparent"
              )}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare className={cn("w-4 h-4 shrink-0", activeSessionId === session.id ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                <div className="truncate text-sm font-medium">{session.title}</div>
              </div>
              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                <button 
                  onClick={(e) => handlePinSession(e, session.id)} 
                  className={cn("p-1.5 rounded hover:bg-secondary transition-colors", session.pinned ? "text-primary opacity-100" : "text-muted-foreground")}
                  title={session.pinned ? "Unpin" : "Pin"}
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={(e) => handleDeleteSession(e, session.id)} 
                  className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col relative h-full">
        {/* Header */}
        <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-background/80 backdrop-blur-md absolute top-0 w-full z-10">
          <div className="flex items-center gap-4">
            <h1 className="font-bold text-lg">{activeSession?.title || 'New Chat'}</h1>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-secondary rounded-full text-xs font-semibold text-muted-foreground">
              {AVAILABLE_PROVIDERS.find(p => p.id === provider)?.name}
              <span className="opacity-50">•</span>
              {MODELS_BY_PROVIDER[provider].find(m => m.id === selectedModel)?.name}
            </div>
            {useDefaultKey && <span className="text-xs font-semibold px-2 py-1 bg-green-500/20 text-green-500 rounded-md">Free Default Key</span>}
          </div>
          <div className="flex items-center gap-3">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".txt,.pdf,.md,.docx"
              onChange={handleFileUpload} 
            />
            <button 
              onClick={handleConnectFolder}
              className={cn(
                "flex items-center gap-2 text-sm font-semibold transition-colors px-3 py-1.5 rounded-lg",
                isConnected ? "text-green-500 bg-green-500/10" : "text-amber-500 bg-amber-500/10 hover:bg-amber-500/20"
              )}
            >
              <FolderOpen className="w-4 h-4" />
              <span className="hidden sm:inline">{isConnected ? 'Folder Connected' : 'Connect Folder'}</span>
            </button>
          </div>
        </header>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-24 pb-32">
          <div className="max-w-3xl mx-auto space-y-6">
            {!activeSession?.messages?.length ? (
              <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-4 opacity-70">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <h2 className="text-2xl font-bold">Upload & Chat</h2>
                <p className="text-muted-foreground max-w-sm">
                  Upload a document to embed it into the local Zvec database, then ask questions about it using your preferred AI model!
                </p>
                {!apiKey && !useDefaultKey && (
                  <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm font-medium hover:bg-primary/30 transition-colors"
                  >
                    Configure API Key First
                  </button>
                )}
              </div>
            ) : (
              activeSession.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-4 w-full",
                    msg.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "px-5 py-4 rounded-2xl max-w-[85%] sm:max-w-[75%] leading-relaxed shadow-lg backdrop-blur-sm",
                      msg.role === 'user' 
                        ? "bg-primary text-white rounded-tr-sm" 
                        : "bg-card border border-border text-card-foreground rounded-tl-sm"
                    )}
                  >
                    <div className={cn("prose prose-sm md:prose-base dark:prose-invert max-w-none", msg.role === 'user' ? "prose-p:text-white" : "")}>
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))
            )}
            
            {isLoading && (
              <div className="flex justify-start w-full gap-4">
                 <div className="px-5 py-4 rounded-2xl bg-card border border-border rounded-tl-sm flex items-center gap-2 shadow-lg">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 w-full bg-gradient-to-t from-background via-background to-transparent pt-10 pb-6 px-4 sm:px-12 flex flex-col items-center">
          
          <div className="w-full max-w-4xl relative group">
            <form onSubmit={handleSendMessage} className="relative flex items-center">
              <button
                type="button"
                onClick={() => setIsContextModalOpen(true)}
                className={cn(
                  "absolute left-2 p-2.5 rounded-xl transition-all duration-300 z-10 flex items-center justify-center",
                  (activeSession?.attachedFiles && activeSession.attachedFiles.length > 0) 
                    ? "bg-primary/20 text-primary hover:bg-primary/30" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
                title="Manage Context Files"
              >
                <Plus className={cn("w-5 h-5 transition-transform", isContextModalOpen ? "rotate-45" : "rotate-0")} />
                {activeSession?.attachedFiles && activeSession.attachedFiles.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full animate-in zoom-in">
                    {activeSession.attachedFiles.length}
                  </span>
                )}
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim()) {
                      handleSendMessage(e);
                    }
                  }
                }}
                rows={Math.max(1, Math.min(5, input.split('\n').length))}
                placeholder={(apiKey || useDefaultKey) ? "Ask a question about your documents..." : "Please configure API key first..."}
                className="w-full bg-input/50 backdrop-blur-md border border-border rounded-2xl pl-14 pr-14 py-4 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all shadow-xl resize-none custom-scrollbar"
                disabled={isLoading || (!apiKey && !useDefaultKey)}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading || (!apiKey && !useDefaultKey)}
                className="absolute right-2 p-2 bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
            <div className="text-center mt-3 text-xs text-muted-foreground">
              Powered by Zvec (In-Memory), LangGraph, and {AVAILABLE_PROVIDERS.find(p => p.id === provider)?.name || 'AI'}. 
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

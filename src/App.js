import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged,
    signInWithCustomToken 
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    doc, 
    onSnapshot,
    deleteDoc,
    setDoc,
    query,
    serverTimestamp
} from 'firebase/firestore';
import { ArrowRight, Book, Bot, Copy, Loader2, Save, Trash2, Wand2, X, Plus } from 'lucide-react';

// --- Firebase Configuration ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-prompt-studio';
const firebaseConfig = typeof __initial_auth_token !== 'undefined' ? JSON.parse(__firebase_config) : { apiKey: "your-fallback-api-key", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" };
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Helper Components ---
const Card = ({ children, className = '', title, icon, actions }) => (
  <div className={`bg-white/5 border border-white/10 rounded-xl shadow-lg backdrop-blur-sm ${className}`}>
    {(title || icon || actions) && (
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    )}
    <div className="p-4">{children}</div>
  </div>
);

const Button = ({ children, onClick, variant = 'primary', disabled = false, className = '' }) => {
  const baseStyles = 'px-4 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900';
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed focus:ring-indigo-500',
    secondary: 'bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:bg-gray-700/50 disabled:cursor-not-allowed focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-500 focus:ring-red-500',
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${baseStyles} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

const IconButton = ({ children, onClick, disabled = false, tooltip }) => (
    <div className="relative group">
        <button 
            onClick={onClick} 
            disabled={disabled} 
            className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {children}
        </button>
        {tooltip && <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-900 text-white text-xs rounded-md px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">{tooltip}</span>}
    </div>
);


const Spinner = () => <Loader2 className="animate-spin" />;

// --- Main Application Page Component ---
export default function PromptStudioPage() {
  // --- State Management ---
  const [promptTemplate, setPromptTemplate] = useState("Write a short, engaging blog post about {{topic}} for an audience of {{audience}}.");
  const [variables, setVariables] = useState([{ name: 'topic', value: 'React Hooks' }, { name: 'audience', value: 'intermediate developers' }]);
  const [apiResponse, setApiResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Firebase state
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  // Prompt library state
  const [savedPrompts, setSavedPrompts] = useState([]);
  const [selectedPromptId, setSelectedPromptId] = useState(null);
  const [promptName, setPromptName] = useState('My First Prompt');
  const [showLibrary, setShowLibrary] = useState(false);
  const [promptToDelete, setPromptToDelete] = useState(null);

  // --- Firebase Initialization and Auth ---
  useEffect(() => {
    const app = initializeApp(firebaseConfig);
    const firestoreDb = getFirestore(app);
    const firebaseAuth = getAuth(app);
    setDb(firestoreDb);
    setAuth(firebaseAuth);

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        try {
          if (initialAuthToken) {
            await signInWithCustomToken(firebaseAuth, initialAuthToken);
          } else {
            await signInAnonymously(firebaseAuth);
          }
        } catch (error) {
          console.error("Authentication failed:", error);
        }
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);
  
  // --- Firestore Real-time Listener for Prompts ---
  useEffect(() => {
      if (!isAuthReady || !db || !userId) return;

      const promptsCollectionPath = `artifacts/${appId}/users/${userId}/prompts`;
      const q = query(collection(db, promptsCollectionPath));

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
          const promptsData = querySnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
          }));
          promptsData.sort((a, b) => a.name.localeCompare(b.name));
          setSavedPrompts(promptsData);
      }, (error) => {
          console.error("Error fetching prompts:", error);
      });

      return () => unsubscribe();
  }, [isAuthReady, db, userId]);

  // --- Core Logic: Variable Extraction & Prompt Compilation ---
  const extractVariables = (template) => {
    const regex = /{{\s*(\w+)\s*}}/g;
    const matches = template.match(regex) || [];
    const uniqueVars = [...new Set(matches.map(v => v.replace(/{{\s*|\s*}}/g, '')))];
    return uniqueVars;
  };

  useEffect(() => {
    const extractedVarNames = extractVariables(promptTemplate);
    setVariables(prevVars => {
      const newVars = extractedVarNames.map(name => {
        const existingVar = prevVars.find(v => v.name === name);
        return existingVar || { name, value: '' };
      });
      return newVars;
    });
  }, [promptTemplate]);

  const finalPrompt = useMemo(() => {
    return variables.reduce((acc, curr) => {
      const regex = new RegExp(`{{\\s*${curr.name}\\s*}}`, 'g');
      return acc.replace(regex, curr.value || `{{${curr.name}}}`);
    }, promptTemplate);
  }, [promptTemplate, variables]);
  
  // --- Handlers ---
  const handleVariableChange = (index, value) => {
    const newVariables = [...variables];
    newVariables[index].value = value;
    setVariables(newVariables);
  };

  const handleTestPrompt = async () => {
      setIsLoading(true);
      setApiResponse('');
      try {
          const payload = {
              contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
          };
          const apiKey = ""; // Provided by environment
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
          const response = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });

          if (!response.ok) {
              throw new Error(`API call failed with status: ${response.status}`);
          }

          const result = await response.json();
          if (result.candidates && result.candidates.length > 0) {
              const text = result.candidates[0].content.parts[0].text;
              setApiResponse(text);
          } else {
              setApiResponse("Error: Received an empty or invalid response from the API.");
          }
      } catch (error) {
          console.error('Gemini API Error:', error);
          setApiResponse(`An error occurred: ${error.message}. Please check the console for details.`);
      }
      setIsLoading(false);
  };
  
  const handleCopy = (text) => {
    const tempTextArea = document.createElement('textarea');
    tempTextArea.value = text;
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    document.execCommand('copy');
    document.body.removeChild(tempTextArea);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleSavePrompt = async () => {
    if (!db || !userId || !promptName) return;
    setIsSaving(true);
    const cleanName = promptName.replace(/\*$/, ''); // Remove trailing asterisk on save
    const promptData = {
        name: cleanName,
        template: promptTemplate,
        createdAt: serverTimestamp(),
    };
    
    try {
        const promptsCollectionPath = `artifacts/${appId}/users/${userId}/prompts`;
        if (selectedPromptId) {
            const docRef = doc(db, promptsCollectionPath, selectedPromptId);
            await setDoc(docRef, promptData, { merge: true });
        } else {
            const docRef = await addDoc(collection(db, promptsCollectionPath), promptData);
            setSelectedPromptId(docRef.id);
        }
        setPromptName(cleanName);
    } catch (error) {
        console.error("Error saving prompt:", error);
    } finally {
        setIsSaving(false);
    }
  };

  const handleLoadPrompt = (prompt) => {
    setSelectedPromptId(prompt.id);
    setPromptName(prompt.name);
    setPromptTemplate(prompt.template);
    setApiResponse('');
    setShowLibrary(false);
  };
  
  const handleNewPrompt = () => {
      setSelectedPromptId(null);
      setPromptName("Untitled Prompt");
      setPromptTemplate("Your new prompt template with a {{variable}} here.");
      setApiResponse('');
  };
  
  const handleDeletePrompt = (promptId, e) => {
    e.stopPropagation();
    setPromptToDelete(promptId);
  };

  const confirmActionDelete = async () => {
    if (!promptToDelete || !db || !userId) return;
    try {
      const docRef = doc(db, `artifacts/${appId}/users/${userId}/prompts`, promptToDelete);
      await deleteDoc(docRef);
      if (selectedPromptId === promptToDelete) {
        handleNewPrompt();
      }
    } catch (error) {
      console.error("Error deleting prompt:", error);
    } finally {
      setPromptToDelete(null);
    }
  };

  const cancelDelete = () => {
    setPromptToDelete(null);
  };

  if (!isAuthReady) {
      return (
          <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
              <Spinner />
              <span className="ml-4">Initializing Studio...</span>
          </div>
      );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-900 text-gray-200 font-sans p-4 lg:p-6 bg-grid-white/[0.05]">
        <div className="max-w-7xl mx-auto">
          <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
            <div className="flex items-center gap-3 mb-4 sm:mb-0">
              <Wand2 className="w-8 h-8 text-indigo-400" />
              <div>
                  <h1 className="text-2xl lg:text-3xl font-bold text-white">Prompt Studio</h1>
                  <p className="text-xs text-gray-400 max-w-xs sm:max-w-none break-all">User ID: {userId}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setShowLibrary(true)} variant="secondary">
                  <Book size={16} /> My Library ({savedPrompts.length})
              </Button>
              <Button onClick={handleNewPrompt}>
                  <Plus size={16} /> New Prompt
              </Button>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="flex flex-col gap-6">
              <Card title="Prompt Template" icon={<Wand2 className="text-indigo-400" />}>
                <p className="text-sm text-gray-400 mb-3">
                  1. Edit your template. Use <code className="bg-gray-700/50 text-gray-300 px-1 py-0.5 rounded-sm font-mono text-xs">{"{{variables}}"}</code>.
                </p>
                <textarea
                  value={promptTemplate}
                  onChange={(e) => {
                      setPromptTemplate(e.target.value);
                      if (selectedPromptId) {
                          setSelectedPromptId(null);
                          setPromptName(prev => prev.endsWith('*') ? prev : `${prev}*`);
                      }
                  }}
                  className="w-full h-48 bg-gray-900/50 border border-white/10 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow font-mono text-sm leading-relaxed"
                  placeholder="e.g., Generate a tweet about {{product}}."
                />
                <p className="text-sm text-gray-400 my-3">
                  2. Fill in the variables below.
                </p>
                <Button onClick={handleTestPrompt} disabled={isLoading} className="w-full">
                  {isLoading ? <Spinner /> : <Bot size={16} />}
                  {isLoading ? 'Generating...' : '3. Test with Gemini'}
                </Button>
              </Card>

              {variables.length > 0 && (
                <Card title="Variables" icon={<ArrowRight className="text-green-400" />}>
                  <div className="space-y-4">
                    {variables.map((variable, index) => (
                      <div key={index}>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5 font-mono">{variable.name}</label>
                        <input
                          type="text"
                          value={variable.value}
                          onChange={(e) => handleVariableChange(index, e.target.value)}
                          className="w-full bg-gray-900/50 border border-white/10 rounded-lg p-2 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow"
                          placeholder={`Value for ${variable.name}...`}
                        />
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
            
            <div className="flex flex-col">
              <Card title="AI Response" icon={<Bot className="text-purple-400" />} className="flex-grow flex flex-col" actions={
                  <IconButton onClick={() => handleCopy(apiResponse)} disabled={!apiResponse} tooltip={copied ? 'Copied!' : 'Copy Response'}>
                      <Copy size={16}/>
                  </IconButton>
              }>
                 <div className="h-full min-h-[40rem] flex-grow bg-gray-900/50 border-white/10 rounded-lg p-3 text-gray-200 overflow-y-auto prose prose-invert prose-sm max-w-none">
                  {isLoading && (
                      <div className="flex items-center justify-center h-full text-gray-400">
                          <Spinner /> <span className="ml-2">Waiting for response...</span>
                      </div>
                  )}
                  {apiResponse ? (
                    <p className="whitespace-pre-wrap">{apiResponse}</p>
                  ) : (
                    !isLoading && <p className="text-gray-500">The AI's response will appear here.</p>
                  )}
                </div>
              </Card>
            </div>
          </div>
          
          <div className="mt-6">
              <Card>
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                      <input 
                          type="text"
                          value={promptName}
                          onChange={(e) => setPromptName(e.target.value)}
                          className="w-full sm:w-1/2 bg-gray-900/50 border border-white/10 rounded-lg p-2 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow"
                          placeholder="Enter a name for this prompt..."
                      />
                      <Button onClick={handleSavePrompt} disabled={isSaving || !promptName} className="w-full sm:w-auto">
                          {isSaving ? <Spinner /> : <Save size={16} />}
                          {selectedPromptId ? 'Update Prompt' : 'Save to Library'}
                      </Button>
                  </div>
              </Card>
          </div>
        </div>
        
        {showLibrary && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowLibrary(false)}>
                <div className="bg-gray-800 border border-white/10 rounded-xl w-full max-w-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between p-4 border-b border-white/10">
                        <h3 className="text-xl font-semibold text-white">My Prompt Library</h3>
                        <IconButton onClick={() => setShowLibrary(false)}>
                            <X size={20} />
                        </IconButton>
                    </div>
                    <div className="p-4 max-h-[60vh] overflow-y-auto">
                        {savedPrompts.length > 0 ? (
                            <ul className="space-y-2">
                                {savedPrompts.map(p => (
                                    <li key={p.id} className="group flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer" onClick={() => handleLoadPrompt(p)}>
                                        <div>
                                            <p className="font-semibold text-white">{p.name}</p>
                                            <p className="text-xs text-gray-400 truncate max-w-md">{p.template}</p>
                                        </div>
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                          <IconButton onClick={(e) => handleDeletePrompt(p.id, e)} tooltip="Delete">
                                              <Trash2 size={16} className="text-red-400 hover:text-red-300"/>
                                          </IconButton>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="text-center py-8 text-gray-400">
                                <Book size={40} className="mx-auto mb-2"/>
                                <p>Your library is empty.</p>
                                <p className="text-sm">Save a prompt to see it here.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {promptToDelete && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-gray-800 border border-white/10 rounded-xl w-full max-w-md shadow-2xl">
                    <div className="p-6 text-center">
                        <h3 className="text-lg font-semibold text-white">Confirm Deletion</h3>
                        <p className="text-gray-400 mt-2">Are you sure you want to delete this prompt? This action cannot be undone.</p>
                    </div>
                    <div className="flex justify-end gap-3 p-4 bg-gray-900/50 rounded-b-xl">
                        <Button onClick={cancelDelete} variant="secondary">Cancel</Button>
                        <Button onClick={confirmActionDelete} variant="danger">Delete</Button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </>
  );
}
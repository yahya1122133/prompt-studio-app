import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRight, Book, Bot, Copy, History, Loader2, Save, Search, Settings, Trash2, Wand2, X, Plus, Sparkles } from 'lucide-react';

// --- Helper Components ---
const Card = ({ children, className = '', title, icon, actions }) => (
    <div className={`bg-white/5 border border-white/10 rounded-xl shadow-lg backdrop-blur-sm ${className}`}>
        {(title || icon || actions) && (
            <div className="flex items-center justify-between p-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div>{icon}</div>
                    <h2 className="text-lg font-semibold text-white">{title}</h2>
                </div>
                {actions && <div className="flex items-center gap-2">{actions}</div>}
            </div>
        )}
        <div className="p-4">{children}</div>
    </div>
);

const Button = ({ children, onClick, variant = 'primary', disabled = false, className = '' }) => {
    const baseStyles = 'px-4 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 active:scale-95';
    const variants = {
        primary: 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed focus:ring-indigo-500',
        secondary: 'bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:bg-gray-700/50 disabled:cursor-not-allowed focus:ring-gray-500',
        danger: 'bg-red-600 text-white hover:bg-red-500 focus:ring-red-500',
    };
    return (<button onClick={onClick} disabled={disabled} className={`${baseStyles} ${variants[variant]} ${className}`}>{children}</button>);
};

const IconButton = ({ children, onClick, disabled = false, tooltip }) => (
    <div className="relative group">
        <button onClick={onClick} disabled={disabled} className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{children}</button>
        {tooltip && <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-900 text-white text-xs rounded-md px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">{tooltip}</span>}
    </div>
);

const Spinner = () => <Loader2 className="animate-spin" />;

// --- Main Application Component ---
export default function App() {
    // --- State Management ---
    const [promptTemplate, setPromptTemplate] = useState("Write a short, engaging blog post about {{topic}} for an audience of {{audience}}.");
    const [variables, setVariables] = useState([{ name: 'topic', value: 'React Hooks' }, { name: 'audience', value: 'intermediate developers' }]);
    const [apiResponse, setApiResponse] = useState('');
    const [responseHistory, setResponseHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    // AI Configuration
    const [temperature, setTemperature] = useState(0.7);
    const model = 'gemini-2.0-flash'; // Hardcoded model

    // Prompt library state
    const [savedPrompts, setSavedPrompts] = useState([]);
    const [filteredPrompts, setFilteredPrompts] = useState([]);
    const [librarySearchTerm, setLibrarySearchTerm] = useState('');
    const [selectedPromptId, setSelectedPromptId] = useState(null);
    const [promptName, setPromptName] = useState('My First Prompt');
    
    // UI State
    const [showLibrary, setShowLibrary] = useState(false);
    const [promptToDelete, setPromptToDelete] = useState(null);
    const [statusMessage, setStatusMessage] = useState({ text: '', type: '', id: 0 });

    // --- Utility Functions ---
    const showStatus = (text, type = 'info', duration = 3000) => {
        const id = Date.now();
        setStatusMessage({ text, type, id });
        setTimeout(() => {
            setStatusMessage(current => (current.id === id ? { text: '', type: '', id: 0 } : current));
        }, duration);
    };
    
    // --- Load prompts from Local Storage on initial render ---
    useEffect(() => {
        try {
            const promptsFromStorage = localStorage.getItem('promptStudioPrompts');
            if (promptsFromStorage) {
                const parsedPrompts = JSON.parse(promptsFromStorage);
                parsedPrompts.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
                setSavedPrompts(parsedPrompts);
            }
        } catch (error) {
            console.error("Could not load prompts from local storage:", error);
            showStatus("Could not load library.", "error");
        }
    }, []);
    
    // --- Library Search Filtering ---
    useEffect(() => {
        setFilteredPrompts(
            savedPrompts.filter(p => 
                p.name.toLowerCase().includes(librarySearchTerm.toLowerCase()) ||
                p.template.toLowerCase().includes(librarySearchTerm.toLowerCase())
            )
        );
    }, [librarySearchTerm, savedPrompts]);


    // --- Core Logic ---
    useEffect(() => {
        const regex = /{{\s*(\w+)\s*}}/g;
        const matches = promptTemplate.match(regex) || [];
        const uniqueVars = [...new Set(matches.map(v => v.replace(/{{\s*|\s*}}/g, '')))];
        setVariables(prevVars => uniqueVars.map(name => prevVars.find(v => v.name === name) || { name, value: '' }));
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
        showStatus("Generating response...", "info", 5000);
        try {
            const payload = {
                contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
                generationConfig: { temperature: parseFloat(temperature) }
            };
            const apiKey = ""; // Provided by the environment at runtime.
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(`API call failed: ${response.statusText}`);
            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                setApiResponse(text);
                setResponseHistory(prev => [text, ...prev].slice(0, 5));
                showStatus("Success!", "success");
            } else {
                throw new Error("Received an empty or invalid response from the API.");
            }
        } catch (error) {
            console.error('Gemini API Error:', error);
            const errorMessage = `An error occurred: ${error.message}.`;
            setApiResponse(errorMessage);
            showStatus(errorMessage, "error", 5000);
        }
        setIsLoading(false);
    };
    
    const handleSavePrompt = () => {
        if (!promptName) return;
        setIsSaving(true);
        
        const cleanName = promptName.replace(/\*$/, '');
        let newPrompts;
        const promptData = { 
            name: cleanName, 
            template: promptTemplate, 
            temperature, 
            savedAt: Date.now() 
        };
        
        if (selectedPromptId) {
            newPrompts = savedPrompts.map(p => p.id === selectedPromptId ? { ...p, ...promptData } : p);
        } else {
            const newPrompt = { id: Date.now().toString(), ...promptData };
            newPrompts = [newPrompt, ...savedPrompts];
            setSelectedPromptId(newPrompt.id);
        }

        newPrompts.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        setSavedPrompts(newPrompts);
        localStorage.setItem('promptStudioPrompts', JSON.stringify(newPrompts));
        setPromptName(cleanName);
        showStatus(selectedPromptId ? "Prompt updated." : "Prompt saved.", "success");
        setIsSaving(false);
    };

    const handleLoadPrompt = (prompt) => {
        setSelectedPromptId(prompt.id);
        setPromptName(prompt.name);
        setPromptTemplate(prompt.template);
        setTemperature(prompt.temperature || 0.7);
        setApiResponse('');
        setResponseHistory([]);
        setShowLibrary(false);
        showStatus(`Loaded "${prompt.name}".`, "info");
    };
    
    const handleNewPrompt = () => {
        setSelectedPromptId(null);
        setPromptName("Untitled Prompt");
        setPromptTemplate("Your new prompt template with a {{variable}} here.");
        setApiResponse('');
        setResponseHistory([]);
        showStatus("Started a new prompt.", "info");
    };
    
    const confirmActionDelete = () => {
        if (!promptToDelete) return;
        const newPrompts = savedPrompts.filter(p => p.id !== promptToDelete);
        setSavedPrompts(newPrompts);
        localStorage.setItem('promptStudioPrompts', JSON.stringify(newPrompts));
        showStatus("Prompt deleted.", "success");
        if (selectedPromptId === promptToDelete) handleNewPrompt();
        setPromptToDelete(null);
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 font-sans p-4 lg:p-6 bg-grid-white/[0.05]">
            <div className="max-w-7xl mx-auto">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                    <div className="flex items-center gap-3 mb-4 sm:mb-0">
                        <Sparkles className="w-8 h-8 text-indigo-400" />
                        <h1 className="text-2xl lg:text-3xl font-bold text-white">Prompt Studio</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button onClick={() => setShowLibrary(true)} variant="secondary"><Book size={16} /> My Library ({savedPrompts.length})</Button>
                        <Button onClick={handleNewPrompt}><Plus size={16} /> New Prompt</Button>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* --- Left Column: Editor, Variables & Config --- */}
                    <div className="flex flex-col gap-6">
                        <Card title="Prompt Editor" icon={<Wand2 className="text-indigo-400" />}>
                           <textarea value={promptTemplate} onChange={(e) => {setPromptTemplate(e.target.value); if (selectedPromptId) {setSelectedPromptId(null); setPromptName(p => p.endsWith('*') ? p : `${p}*`);}}} className="w-full h-48 bg-gray-900/50 border border-white/10 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow font-mono text-sm leading-relaxed" placeholder="e.g., Generate a tweet about {{product}}." />
                           <Button onClick={handleTestPrompt} disabled={isLoading} className="w-full mt-4">{isLoading ? <Spinner /> : <Sparkles size={16} />} {isLoading ? 'Generating...' : 'Test with Gemini'}</Button>
                        </Card>

                        {variables.length > 0 && (
                          <Card title="Variables" icon={<ArrowRight className="text-green-400" />}>
                            <div className="space-y-4 max-h-60 overflow-y-auto pr-2">{variables.map((v, i) => (<div key={i}><label className="block text-sm font-medium text-gray-300 mb-1.5 font-mono">{v.name}</label><input type="text" value={v.value} onChange={(e) => handleVariableChange(i, e.target.value)} className="w-full bg-gray-900/50 border border-white/10 rounded-lg p-2 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none" /></div>))}</div>
                          </Card>
                        )}

                        <Card title="AI Configuration" icon={<Settings className="text-gray-400" />}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Model</label>
                                    <p className="text-sm text-gray-400 bg-gray-900/50 border border-white/10 rounded-lg py-2 px-3">Gemini 2.0 Flash (Default)</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Temperature: <span className="font-mono text-indigo-400">{temperature}</span></label>
                                    <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={e => setTemperature(e.target.value)} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                                    <p className="text-xs text-gray-500 mt-2">Lower values are more predictable. Higher values are more creative.</p>
                                </div>
                            </div>
                        </Card>
                    </div>
                    
                    {/* --- Right Column: Response & History --- */}
                    <div className="flex flex-col gap-6">
                        <Card title="Latest AI Response" icon={<Bot className="text-purple-400" />} className="h-full flex flex-col" actions={<IconButton onClick={() => {navigator.clipboard.writeText(apiResponse); showStatus('Response copied!', 'success');}} disabled={!apiResponse} tooltip="Copy"><Copy size={16}/></IconButton>}>
                           <div className="flex-grow h-full bg-gray-900/50 border-white/10 rounded-lg p-3 text-gray-200 overflow-y-auto prose prose-invert prose-sm max-w-none min-h-[20rem]">{isLoading ? (<div className="flex items-center justify-center h-full text-gray-400"><Spinner /> <span className="ml-2">Waiting...</span></div>) : (apiResponse ? <p className="whitespace-pre-wrap">{apiResponse}</p> : <p className="text-gray-500 flex items-center justify-center h-full">The AI's response will appear here.</p>)}</div>
                        </Card>

                        <Card title="Response History" icon={<History className="text-gray-400" />} actions={<Button onClick={() => setResponseHistory([])} variant="secondary" className="px-2 py-1 text-xs" disabled={responseHistory.length === 0}>Clear</Button>}>
                           <div className="space-y-3 max-h-60 overflow-y-auto pr-2">{responseHistory.length > 0 ? responseHistory.map((r, i) => (<div key={i} className="text-sm p-2 bg-white/5 rounded-md border border-white/10 text-gray-400 truncate" title={r}>{r}</div>)) : <p className="text-gray-500 text-sm">Previous responses will be logged here.</p>}</div>
                        </Card>
                    </div>
                </div>
                
                <div className="mt-6"><Card><div className="flex flex-col sm:flex-row items-center gap-4"><input type="text" value={promptName} onChange={(e) => setPromptName(e.target.value)} className="w-full sm:w-1/2 bg-gray-900/50 border border-white/10 rounded-lg p-2 text-gray-200 focus:ring-2 focus:ring-indigo-500" placeholder="Enter a name for this prompt..." /><Button onClick={handleSavePrompt} disabled={isSaving || !promptName} className="w-full sm:w-auto">{isSaving ? <Spinner /> : <Save size={16} />} {selectedPromptId ? 'Update Prompt' : 'Save to Library'}</Button></div></Card></div>
            </div>
            
            {/* --- Modals & Status --- */}
            <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${showLibrary ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setShowLibrary(false)}>
              <div className={`bg-gray-800 border border-white/10 rounded-xl w-full max-w-2xl shadow-2xl transition-all duration-300 ${showLibrary ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between p-4 border-b border-white/10">
                      <h3 className="text-xl font-semibold text-white">My Prompt Library</h3><IconButton onClick={() => setShowLibrary(false)}><X size={20} /></IconButton>
                  </div>
                  <div className="p-4 border-b border-white/10"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input type="search" placeholder="Search library..." value={librarySearchTerm} onChange={e => setLibrarySearchTerm(e.target.value)} className="w-full bg-gray-900/50 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-gray-200 focus:ring-2 focus:ring-indigo-500" /></div></div>
                  <div className="p-4 max-h-[50vh] overflow-y-auto">{filteredPrompts.length > 0 ? (<ul className="space-y-2">{filteredPrompts.map(p => (<li key={p.id} className="group flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer" onClick={() => handleLoadPrompt(p)}><div><p className="font-semibold text-white">{p.name}</p><p className="text-xs text-gray-400 truncate max-w-md">{p.template}</p></div><div className="opacity-0 group-hover:opacity-100 transition-opacity"><IconButton onClick={(e) => { e.stopPropagation(); setPromptToDelete(p.id); }} tooltip="Delete"><Trash2 size={16} className="text-red-400 hover:text-red-300"/></IconButton></div></li>))}</ul>) : (<div className="text-center py-8 text-gray-400"><Book size={40} className="mx-auto mb-2"/><p>No prompts found.</p><p className="text-sm">{savedPrompts.length > 0 ? "Try a different search term." : "Save a prompt to see it here."}</p></div>)}</div>
              </div>
            </div>

            <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${promptToDelete ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <div className={`bg-gray-800 border border-white/10 rounded-xl w-full max-w-md shadow-2xl transition-all duration-300 ${promptToDelete ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}><div className="p-6 text-center"><h3 className="text-lg font-semibold text-white">Confirm Deletion</h3><p className="text-gray-400 mt-2">Are you sure you want to delete this prompt? This action cannot be undone.</p></div><div className="flex justify-end gap-3 p-4 bg-gray-900/50 rounded-b-xl"><Button onClick={() => setPromptToDelete(null)} variant="secondary">Cancel</Button><Button onClick={confirmActionDelete} variant="danger">Delete</Button></div></div>
            </div>

            <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 transition-all duration-300 ${statusMessage.text ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5 pointer-events-none'}`}>
                <div className={`px-4 py-2 rounded-lg text-white text-sm shadow-2xl ${statusMessage.type === 'success' ? 'bg-green-600' : statusMessage.type === 'error' ? 'bg-red-600' : 'bg-gray-700'}`}>{statusMessage.text}</div>
            </div>
        </div>
    );
}

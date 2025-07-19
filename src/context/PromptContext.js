// src/context/PromptContext.js

import React, { createContext, useContext, useReducer, useRef, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';

// ===== HELPER FUNCTIONS =====
const checkRateLimit = (requests, limit, interval) => {
    const now = Date.now();
    const recentRequests = requests.filter(time => now - time < interval);
    if (recentRequests.length < limit) {
        return { isAllowed: true, newRequests: [...recentRequests, now] };
    }
    return { isAllowed: false, newRequests: recentRequests };
};

function learnFromSuccess(currentLearning, successfulPrompt) {
    return {
        ...currentLearning,
        successfulPatterns: [
            ...currentLearning.successfulPatterns.slice(0, 99),
            successfulPrompt
        ]
    };
}

// ===== INITIAL STATE & REDUCER =====
const initialState = {
    promptTemplate: 'Generate a creative tweet about {{product}}.',
    variables: [],
    apiResponse: null,
    responseHistory: [],
    isLoading: false,
    isSaving: false,
    temperature: 0.7,
    savedPrompts: [],
    librarySearchTerm: '',
    selectedPromptId: null,
    promptName: 'Untitled Prompt',
    provider: 'auto',
    providerConfig: {
        gemini: { topK: 40, topP: 0.95 },
        deepseek: { topP: 0.9, maxTokens: 2048 }
    },
    activeProviderSettings: {},
    promptLearning: {
        successfulPatterns: [],
        styleWeights: { technical: 0.5, creative: 0.5, structured: 0.5 }
    },
    pollCount: 0,
    asyncRequestId: null,
    progress: 0,
    lastRequestTime: 0
};

function promptReducer(state, action) {
    switch (action.type) {
        case 'SET_STATE': 
            return { ...state, ...action.payload };
        case 'SET_LOADING': 
            return { ...state, isLoading: action.payload };
        case 'SET_PROMPT_TEMPLATE': 
            return { 
                ...state, 
                promptTemplate: action.payload,
                ...(state.selectedPromptId && {
                    promptName: state.promptName.endsWith('*') ? state.promptName : `${state.promptName}*`
                })
            };
        case 'SET_VARIABLES': 
            return { ...state, variables: action.payload };
        case 'SET_API_RESPONSE': 
            return { ...state, apiResponse: action.payload };
        case 'ADD_TO_HISTORY': {
            const newHistory = [action.payload, ...state.responseHistory];
            const uniqueHistory = newHistory.filter((item, index, self) =>
                item && self.findIndex(h => h.id === item.id) === index
            ).slice(0, 20);
            return { ...state, responseHistory: uniqueHistory };
        }
        case 'CLEAR_HISTORY': 
            return { ...state, responseHistory: [] };
        case 'SET_SAVING': 
            return { ...state, isSaving: action.payload };
        case 'SET_TEMPERATURE': 
            return { ...state, temperature: action.payload };
        case 'SET_PROVIDER':
            return {
                ...state,
                provider: action.payload,
                activeProviderSettings: {
                    ...initialState.providerConfig[action.payload],
                    ...state.providerConfig[action.payload]
                }
            };
        case 'UPDATE_PROVIDER_SETTING':
            if (!state.provider || state.provider === 'auto') return state;
            return {
                ...state,
                providerConfig: {
                    ...state.providerConfig,
                    [state.provider]: {
                        ...state.providerConfig[state.provider],
                        [action.payload.key]: action.payload.value
                    }
                },
                activeProviderSettings: {
                    ...state.activeProviderSettings,
                    [action.payload.key]: action.payload.value
                }
            };
        case 'LOAD_PROMPTS': 
            return { ...state, savedPrompts: action.payload };
        case 'SET_LIBRARY_SEARCH': 
            return { ...state, librarySearchTerm: action.payload };
        case 'SELECT_PROMPT': 
            return { ...state, selectedPromptId: action.payload };
        case 'SET_PROMPT_NAME': 
            return { ...state, promptName: action.payload };
        case 'DELETE_PROMPT': {
            const newPrompts = state.savedPrompts.filter(p => p.id !== action.payload);
            return { 
                ...state, 
                savedPrompts: newPrompts,
                ...(state.selectedPromptId === action.payload && {
                    selectedPromptId: null
                })
            };
        }
        case 'LEARN_FROM_SUCCESS': 
            return { ...state, promptLearning: learnFromSuccess(state.promptLearning, action.payload) };
        case 'SET_POLL_COUNT': 
            return { ...state, pollCount: action.payload };
        case 'SET_ASYNC_REQUEST_ID': 
            return { ...state, asyncRequestId: action.payload };
        case 'SET_PROGRESS': 
            return { 
                ...state, 
                progress: typeof action.payload === 'function' 
                    ? action.payload(state.progress) 
                    : action.payload 
            };
        case 'RESET_PROMPT':
            return { 
                ...state,
                promptTemplate: initialState.promptTemplate,
                variables: initialState.variables,
                apiResponse: initialState.apiResponse,
                selectedPromptId: initialState.selectedPromptId,
                promptName: initialState.promptName,
                activeProviderSettings: initialState.activeProviderSettings
            };
        default: 
            return state;
    }
}

const PromptContext = createContext();

export const PromptProvider = ({ children }) => {
    const [state, dispatch] = useReducer(promptReducer, initialState);
    const rateLimitRequestsRef = useRef([]);
    const timeoutRef = useRef(null);
    const controllerRef = useRef(null);
    const progressIntervalRef = useRef(null);
    const isMountedRef = useRef(true);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
            if (controllerRef.current) controllerRef.current.abort();
        };
    }, []);

    // Load state from localStorage
    useEffect(() => {
        try {
            const savedState = localStorage.getItem('promptStudioState');
            if (savedState) {
                const parsed = JSON.parse(savedState);
                dispatch({ type: 'SET_STATE', payload: parsed });
            }
        } catch (e) {
            console.error("Failed to parse saved state from localStorage", e);
        }
    }, []);

    // Persist state to localStorage with debouncing
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            try {
                // Create a new object with ONLY the data that is safe to save.
                const stateToSave = {
                    promptTemplate: state.promptTemplate,
                    variables: state.variables,
                    responseHistory: state.responseHistory,
                    temperature: state.temperature,
                    savedPrompts: state.savedPrompts,
                    librarySearchTerm: state.librarySearchTerm,
                    selectedPromptId: state.selectedPromptId,
                    promptName: state.promptName,
                    provider: state.provider,
                    providerConfig: state.providerConfig,
                    promptLearning: state.promptLearning,
                };
                localStorage.setItem('promptStudioState', JSON.stringify(stateToSave));
            } catch (error) {
                console.error("Failed to save state to localStorage", error);
            }
        }, 500);
        
        return () => clearTimeout(timeoutId);
    }, [state]);

    const startProgressSimulation = useCallback(() => {
        dispatch({ type: 'SET_PROGRESS', payload: 10 });
        progressIntervalRef.current = setInterval(() => {
            dispatch({ type: 'SET_PROGRESS', payload: p => Math.min(p + 5, 95) });
        }, 800);
    }, []);

    const stopProgressSimulation = useCallback(() => {
        clearInterval(progressIntervalRef.current);
        dispatch({ type: 'SET_PROGRESS', payload: 100 });
        setTimeout(() => {
            if (isMountedRef.current) {
                dispatch({ type: 'SET_PROGRESS', payload: 0 });
            }
        }, 500);
    }, []);

    const pollForResponse = useCallback(async (requestId, finalPrompt, showStatus) => {
        if (!isMountedRef.current) return;
        try {
            const pollResponse = await fetch(`/api/ai-proxy?requestId=${requestId}`);
            
            let pollData;
            try {
                pollData = await pollResponse.json();
            } catch (jsonError) {
                console.error('Poll JSON parse error:', jsonError);
                const text = await pollResponse.text();
                throw new Error(`Invalid JSON response during polling. Status: ${pollResponse.status}. Response: ${text.substring(0, 200)}...`);
            }
            if (pollResponse.status === 202) {
                dispatch({ type: 'SET_POLL_COUNT', payload: state.pollCount + 1 });
                timeoutRef.current = setTimeout(() => pollForResponse(requestId, finalPrompt, showStatus), 2500);
            } else if (pollResponse.ok) {
                stopProgressSimulation();
                dispatch({ type: 'SET_API_RESPONSE', payload: pollData });
                dispatch({ type: 'ADD_TO_HISTORY', payload: pollData });
                showStatus(`Response received from ${pollData.provider}`, "success");
                dispatch({ type: 'LEARN_FROM_SUCCESS', payload: finalPrompt });
                dispatch({ type: 'SET_LOADING', payload: false });
                dispatch({ type: 'SET_POLL_COUNT', payload: 0 });
                dispatch({ type: 'SET_ASYNC_REQUEST_ID', payload: null });
            } else {
                throw new Error(pollData.error?.message || 'Polling failed');
            }
        } catch (error) {
            if (!isMountedRef.current) return;
            showStatus(error.message, "error", 5000);
            stopProgressSimulation();
            dispatch({ type: 'SET_LOADING', payload: false });
            dispatch({ type: 'SET_POLL_COUNT', payload: 0 });
            dispatch({ type: 'SET_ASYNC_REQUEST_ID', payload: null });
        }
    }, [state.pollCount, stopProgressSimulation]);

    const handleGenerateResponse = useCallback(async (finalPrompt, showStatus) => {
        const { isAllowed, newRequests } = checkRateLimit(rateLimitRequestsRef.current, 3, 10000);
        rateLimitRequestsRef.current = newRequests;
        if (!isAllowed) {
            showStatus("Rate limit exceeded. Please wait.", "error");
            return;
        }

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (controllerRef.current) controllerRef.current.abort();
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        
        controllerRef.current = new AbortController();
        const { signal } = controllerRef.current;
        
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_API_RESPONSE', payload: null });
        dispatch({ type: 'SET_ASYNC_REQUEST_ID', payload: null });
        dispatch({ type: 'SET_POLL_COUNT', payload: 0 });
        startProgressSimulation();
        
        try {
            const response = await fetch('/api/ai-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: state.provider,
                    prompt: finalPrompt,
                    temperature: state.temperature,
                    ...state.activeProviderSettings
                }),
                signal
            });

            if (signal.aborted) return;
            
            let data;
            try {
                data = await response.json();
            } catch (jsonError) {
                console.error('JSON parse error:', jsonError);
                const text = await response.text();
                throw new Error(`Invalid JSON response from server. Status: ${response.status}. Response: ${text.substring(0, 200)}...`);
            }

            if (response.status === 202) {
                dispatch({ type: 'SET_ASYNC_REQUEST_ID', payload: data.requestId });
                timeoutRef.current = setTimeout(() => pollForResponse(data.requestId, finalPrompt, showStatus), 2500);
                showStatus("Processing in background...", "info");
            } else if (response.ok) {
                stopProgressSimulation();
                dispatch({ type: 'SET_API_RESPONSE', payload: data });
                dispatch({ type: 'ADD_TO_HISTORY', payload: data });
                showStatus(`Success! (from ${data.provider})`, "success");
                dispatch({ type: 'LEARN_FROM_SUCCESS', payload: finalPrompt });
                dispatch({ type: 'SET_LOADING', payload: false });
            } else {
                throw new Error(data.error?.message || 'API error occurred');
            }
        } catch (error) {
            if (error.name !== 'AbortError' && isMountedRef.current) {
                showStatus(error.message, "error", 5000);
                stopProgressSimulation();
                dispatch({ type: 'SET_LOADING', payload: false });
            }
        }
    }, [pollForResponse, startProgressSimulation, stopProgressSimulation, state.provider, state.temperature, state.activeProviderSettings]);

    const handleSavePrompt = useCallback((showStatus) => {
        const promptName = state.promptName.trim();
        if (!promptName) {
            showStatus("Prompt name required", "error");
            return;
        }
        dispatch({ type: 'SET_SAVING', payload: true });
        const newPromptData = { 
            name: promptName.replace(/\*$/, ''), 
            template: state.promptTemplate, 
            temperature: state.temperature,
            providerConfig: state.providerConfig,
            lastModified: Date.now()
        };
        let newPrompts;
        if (state.selectedPromptId) {
            newPrompts = state.savedPrompts.map(p => 
                p.id === state.selectedPromptId ? { ...p, ...newPromptData } : p
            );
        } else {
            const newPrompt = { 
                id: Date.now().toString(), 
                ...newPromptData,
                createdAt: Date.now()
            };
            newPrompts = [newPrompt, ...state.savedPrompts];
            dispatch({ type: 'SELECT_PROMPT', payload: newPrompt.id });
        }
        dispatch({ type: 'LOAD_PROMPTS', payload: newPrompts });
        dispatch({ type: 'SET_PROMPT_NAME', payload: newPromptData.name });
        showStatus(state.selectedPromptId ? "Prompt updated" : "Prompt saved", "success");
        setTimeout(() => dispatch({ type: 'SET_SAVING', payload: false }), 500);
    }, [state.promptName, state.promptTemplate, state.temperature, state.providerConfig, state.selectedPromptId, state.savedPrompts]);
    
    const handleNewPrompt = useCallback((showStatus) => {
        dispatch({ type: 'RESET_PROMPT' });
        showStatus("New prompt created", "info");
    }, []);

    const updateProviderSetting = useCallback((key, value) => {
        dispatch({ type: 'UPDATE_PROVIDER_SETTING', payload: { key, value } });
    }, []);

    const value = React.useMemo(() => ({
        state,
        dispatch,
        handleGenerateResponse,
        handleSavePrompt,
        handleNewPrompt,
        updateProviderSetting
    }), [state, handleGenerateResponse, handleSavePrompt, handleNewPrompt, updateProviderSetting]);

    return (
        <PromptContext.Provider value={value}>
            {children}
        </PromptContext.Provider>
    );
};

PromptProvider.propTypes = {
    children: PropTypes.node.isRequired
};

export const usePromptContext = () => {
    const context = useContext(PromptContext);
    if (!context) {
        throw new Error('usePromptContext must be used within a PromptProvider');
    }
    return context;
};

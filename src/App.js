// src/App.js

import React, { 
  useState, 
  useEffect, 
  useCallback, 
  useTransition,
  useRef,
  Suspense
} from 'react';
import { AnimatePresence } from 'framer-motion';
import { PromptProvider, usePromptContext } from './context/PromptContext';
import PropTypes from 'prop-types';
import ErrorBoundary from './components/ui/loaders/ErrorBoundary';

// Simple lazy loading for better stability
const AppContent = React.lazy(() => import('./components/AppContent'));
const PromptLibrary = React.lazy(() => import('./components/features/PromptLibrary'));
const DeleteConfirmation = React.lazy(() => import('./components/features/DeleteConfirmation'));
const Footer = React.lazy(() => import('./components/layouts/Footer'));
const Toast = React.lazy(() => import('./components/ui/Toast'));
const GlobalLoader = React.lazy(() => import('./components/ui/loaders/GlobalLoader'));
const ModalLoader = React.lazy(() => import('./components/ui/loaders/ModalLoader'));

/**
 * Main UI Controller Component
 * Handles all modal states, notifications, and UI transitions
 */
const AppController = () => {
  const { dispatch } = usePromptContext();
  const [showLibrary, setShowLibrary] = useState(false);
  const [promptToDelete, setPromptToDelete] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [isPending, startTransition] = useTransition();
  const libraryModalRef = useRef(null);
  const deleteModalRef = useRef(null);
  const toastTimerRef = useRef(null);

  // Cleanup all resources on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Robust notification system
  const showStatus = useCallback((text, type = 'info', duration = 3000) => {
    const id = Date.now();
    setStatusMessage({ text, type, id });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setStatusMessage(current => (current?.id === id ? null : current));
    }, duration);
  }, []);

  // Modal handlers with smooth transitions
  const handleOpenLibrary = () => startTransition(() => setShowLibrary(true));
  const handleDeleteRequest = (prompt) => startTransition(() => setPromptToDelete(prompt));
  const handleLibrarySelect = (prompt) => {
    if (dispatch) {
      dispatch({ type: 'SET_INPUT', payload: prompt });
    }
    handleCloseModals();
  };
  const handleCloseModals = () => startTransition(() => {
    setShowLibrary(false);
    setPromptToDelete(null);
  });

  // Final delete confirmation
  const handleConfirmDelete = () => {
    if (!promptToDelete) return;
    dispatch({ type: 'DELETE_PROMPT', payload: promptToDelete.id });
    showStatus('Prompt deleted successfully', 'success');
    handleCloseModals();
  };

  // Accessibility: Lock body scroll when modals are open
  useEffect(() => {
    const isModalOpen = showLibrary || !!promptToDelete;
    document.body.style.overflow = isModalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showLibrary, promptToDelete]);

  // Accessibility: Focus trap for modals
  useEffect(() => {
    if (showLibrary && libraryModalRef.current) {
      const focusableElements = libraryModalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }
    
    if (promptToDelete && deleteModalRef.current) {
      const focusableElements = deleteModalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }
  }, [showLibrary, promptToDelete]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 bg-grid-white/[0.05]">
      <Suspense fallback={<GlobalLoader />}>
        <AppContent
          onShowLibrary={handleOpenLibrary}
          showStatus={showStatus}
          isPending={isPending}
        />
      </Suspense>

      <AnimatePresence mode="wait">
        {/* Prompt Library Modal */}
        {showLibrary && (
          <Suspense fallback={<ModalLoader />} key="library-modal">
            <div ref={libraryModalRef} aria-modal="true" className="z-40">
              <PromptLibrary
                onClose={handleCloseModals}
                onSelectPrompt={handleLibrarySelect}
                onDeletePrompt={handleDeleteRequest}
                onShowStatus={showStatus}
              />
            </div>
          </Suspense>
        )}

        {/* Delete Confirmation Modal */}
        {promptToDelete && (
          <Suspense fallback={<ModalLoader />} key="delete-modal">
            <div ref={deleteModalRef} aria-modal="true" className="z-40">
              <DeleteConfirmation
                prompt={promptToDelete}
                onConfirm={handleConfirmDelete}
                onCancel={handleCloseModals}
              />
            </div>
          </Suspense>
        )}

        {/* Toast Notifications */}
        {statusMessage && (
          <Suspense fallback={null} key={`toast-${statusMessage.id}`}>
            <Toast
              message={statusMessage.text}
              type={statusMessage.type}
              onDismiss={() => setStatusMessage(null)}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Footer */}
      <Suspense fallback={<div className="h-24 bg-gray-800/50" />}>
        <Footer />
      </Suspense>
    </div>
  );
};

AppController.propTypes = {
  children: PropTypes.node
};

/**
 * Root Application Component
 * Wraps everything with essential providers and error boundaries
 */
function RootApp() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<GlobalLoader />}>
        <PromptProvider>
          <AppController />
        </PromptProvider>
      </Suspense>
    </ErrorBoundary>
  );
}

export default RootApp;
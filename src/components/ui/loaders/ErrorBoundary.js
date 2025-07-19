// src/components/ui/loaders/ErrorBoundary.js

import React from 'react';
import { RefreshCw, AlertTriangle, Mail } from 'lucide-react';
import { motion } from 'framer-motion';
import Button from '../Button';
import PropTypes from 'prop-types'; // ✅ FIX: Add this import statement

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { 
            hasError: false,
            error: null,
            errorInfo: null,
            showDetails: false
        };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });
        console.error("ErrorBoundary caught an error:", error, errorInfo);
        
        // Example for a real error tracking service
        if (window.analytics) {
            window.analytics.track('Component Error', {
                error: error.toString(),
                componentStack: errorInfo.componentStack
            });
        }
    }

    handleReload = () => {
        window.location.reload();
    };

    handleReset = () => {
        this.setState({ 
            hasError: false, 
            error: null, 
            errorInfo: null,
            showDetails: false
        });
    };

    handleCopyError = () => {
        const { error, errorInfo } = this.state;
        const errorText = `
        Error: ${error?.toString()}
        Component Stack: ${errorInfo?.componentStack || 'N/A'}
        `;
        navigator.clipboard.writeText(errorText)
            .then(() => alert('Error details copied to clipboard'))
            .catch(err => console.error('Failed to copy:', err));
    };

    toggleDetails = () => {
        this.setState(prev => ({ showDetails: !prev.showDetails }));
    };

    render() {
        if (this.state.hasError) {
            const { error, errorInfo, showDetails } = this.state;
            const isDev = process.env.NODE_ENV === 'development';

            return (
                <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
                    <motion.div 
                        className="bg-gray-800 border border-white/10 rounded-xl p-8 max-w-md w-full text-center shadow-2xl"
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        transition={{ type: 'spring', damping: 15 }}
                    >
                        <div className="bg-red-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertTriangle className="w-10 h-10 text-red-500" />
                        </div>
                        
                        <h2 className="text-2xl font-bold text-white mb-3">Oops! Something Went Wrong</h2>
                        <p className="text-gray-400 mb-6">
                            We encountered an unexpected error. You can try to reset the component or reload the application.
                        </p>

                        {isDev && (
                            <div className="mb-6 text-left">
                                <button 
                                    onClick={this.toggleDetails}
                                    className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center justify-center w-full mb-2"
                                >
                                    {showDetails ? 'Hide Details' : 'Show Error Details'}
                                </button>
                                
                                {showDetails && (
                                    <motion.div 
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        className="bg-black/30 rounded-lg text-sm font-mono overflow-auto max-h-60"
                                    >
                                        <div className="p-4">
                                            <div className="text-red-400 mb-2">
                                                <strong>Error:</strong> {error?.toString()}
                                            </div>
                                            <div className="text-yellow-400">
                                                <strong>Component Stack:</strong>
                                                <pre className="whitespace-pre-wrap mt-1">
                                                    {errorInfo?.componentStack || 'N/A'}
                                                </pre>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3">
                            <Button 
                                onClick={this.handleReset} 
                                variant="secondary"
                                className="flex-1"
                            >
                                <RefreshCw className="mr-2 w-4 h-4" />
                                Reset Component
                            </Button>
                            <Button 
                                onClick={this.handleReload} 
                                variant="primary"
                                className="flex-1"
                            >
                                Reload Application
                            </Button>
                        </div>

                        <div className="mt-6 pt-6 border-t border-white/10">
                            <p className="text-gray-500 text-sm mb-3">
                                Still having issues? Contact support
                            </p>
                            <a 
                                href="mailto:mindsetwarriorsacademy@gmail.com" 
                                className="inline-flex items-center text-indigo-400 hover:text-indigo-300 text-sm"
                            >
                                <Mail className="mr-1.5 w-4 h-4" />
                                mindsetwarriorsacademy@gmail.com
                            </a>
                            
                            {isDev && showDetails && (
                                <button
                                    onClick={this.handleCopyError}
                                    className="mt-3 text-xs text-gray-500 hover:text-gray-300 block mx-auto"
                                >
                                    Copy error details to clipboard
                                </button>
                            )}
                        </div>
                    </motion.div>
                </div>
            );
        }

        return this.props.children;
    }
}

// Add display name for better debugging
ErrorBoundary.displayName = 'ErrorBoundary';

// Type checking for props (This is now correct because PropTypes is imported)
ErrorBoundary.propTypes = {
    children: PropTypes.node.isRequired
};

export default ErrorBoundary;

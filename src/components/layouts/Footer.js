import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Mail, AlertCircle, Lock, FileText } from 'lucide-react';
import PropTypes from 'prop-types';
import Button from '../ui/Button';

// Base modal component with accessibility enhancements
const BaseModal = ({ 
  title, 
  children, 
  onClose, 
  width = 'max-w-3xl',
  maxHeight = 'max-h-[80vh]'
}) => {
  const modalRef = useRef(null);
  
  // Handle escape key press
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    modalRef.current?.focus();
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        ref={modalRef}
        tabIndex={-1}
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className={`bg-gray-800 border border-white/10 rounded-xl w-full ${width} ${maxHeight} flex flex-col shadow-2xl`}
      >
        <div className="sticky top-0 bg-gray-800/95 backdrop-blur-sm z-10 p-6 border-b border-white/10 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white" id="modal-title">
            {title}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
};

BaseModal.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  onClose: PropTypes.func.isRequired,
  width: PropTypes.string,
  maxHeight: PropTypes.string
};

// Report Issue Modal with form validation
const ReportIssueModal = ({ onClose }) => {
  const [formState, setFormState] = useState({
    email: '',
    issueType: 'Bug Report',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Simulate network request
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // In a real app, you would send the form data to your backend
      // await fetch('/api/report-issue', { method: 'POST', body: JSON.stringify(formState) });
      
      setSubmitStatus('success');
    } catch (error) {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitStatus === 'success') {
    return (
      <BaseModal title="Report Submitted" onClose={onClose} width="max-w-md">
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Thank You!</h3>
          <p className="text-gray-400 mb-6">
            Your report has been submitted. We'll review it and get back to you if needed.
          </p>
          <Button onClick={onClose} variant="primary" className="w-full">
            Close
          </Button>
        </div>
      </BaseModal>
    );
  }

  return (
    <BaseModal title="Report an Issue" onClose={onClose} width="max-w-md">
      <form name="issue-report" method="POST" onSubmit={handleSubmit}>
        <input type="hidden" name="form-name" value="issue-report" />
        <p className="hidden">
          <label>Don't fill this out: <input name="bot-field" /></label>
        </p>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              Your Email
            </label>
            <input
              id="email"
              type="email"
              name="email"
              value={formState.email}
              onChange={handleChange}
              placeholder="email@example.com"
              className="w-full bg-gray-900/50 border border-white/10 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              required
              aria-required="true"
            />
          </div>
          
          <div>
            <label htmlFor="issueType" className="block text-sm font-medium text-gray-300 mb-2">
              Issue Type
            </label>
            <select
              id="issueType"
              name="issueType"
              value={formState.issueType}
              onChange={handleChange}
              className="w-full bg-gray-900/50 border border-white/10 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              aria-required="true"
            >
              <option value="Bug Report">Bug Report</option>
              <option value="Feature Request">Feature Request</option>
              <option value="Security Issue">Security Issue</option>
              <option value="Other">Other</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formState.description}
              onChange={handleChange}
              rows={4}
              placeholder="Please describe the issue in detail..."
              className="w-full bg-gray-900/50 border border-white/10 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              required
              aria-required="true"
            ></textarea>
          </div>
          
          <Button 
            type="submit" 
            variant="primary" 
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Report'}
          </Button>
          
          {submitStatus === 'error' && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-500 rounded-lg text-red-300 text-sm">
              Failed to submit report. Please try again or email us directly.
            </div>
          )}
          
          <div className="mt-6 text-center text-gray-400 text-sm">
            <p>Or email us directly:</p>
            <a 
              href="mailto:mindsetwarriorsacademy@gmail.com" 
              className="text-indigo-400 hover:underline inline-flex items-center mt-1"
            >
              <Mail className="mr-1.5 w-4 h-4" />
              mindsetwarriorsacademy@gmail.com
            </a>
          </div>
        </div>
      </form>
    </BaseModal>
  );
};

ReportIssueModal.propTypes = {
  onClose: PropTypes.func.isRequired
};

// Reusable policy modal with consistent styling
const PolicyModal = ({ title, content, onClose }) => (
  <BaseModal title={title} onClose={onClose}>
    <div className="prose prose-invert max-w-none">
      {content}
    </div>
  </BaseModal>
);

PolicyModal.propTypes = {
  title: PropTypes.string.isRequired,
  content: PropTypes.node.isRequired,
  onClose: PropTypes.func.isRequired
};

// Footer component with improved structure and accessibility
const Footer = () => {
  const [activeModal, setActiveModal] = useState(null);
  
  const openModal = useCallback((modalName) => {
    setActiveModal(modalName);
  }, []);
  
  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);
  
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (activeModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeModal]);

  return (
    <>
      <footer className="mt-16 py-8 border-t border-white/10 bg-gradient-to-t from-gray-900/50 to-transparent">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-center md:text-left mb-6 md:mb-0">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <span className="text-lg font-bold text-white">Promptmakers</span>
              </div>
              <p className="text-gray-400 text-sm">
                © {new Date().getFullYear()} Promptmakers. All rights reserved.
              </p>
              <p className="text-gray-500 text-sm mt-1">
                Made with <span className="text-red-500">❤️</span> for AI enthusiasts
              </p>
            </div>
            
            <div className="flex flex-wrap justify-center gap-4 md:gap-6">
              <button 
                onClick={() => openModal('report')}
                className="text-gray-400 hover:text-indigo-400 text-sm transition-colors font-medium flex items-center"
                aria-label="Report an issue"
              >
                <AlertCircle className="mr-1.5 w-4 h-4" />
                Report an Issue
              </button>
              
              <button 
                onClick={() => openModal('privacy')}
                className="text-gray-400 hover:text-indigo-400 text-sm transition-colors font-medium flex items-center"
                aria-label="View privacy policy"
              >
                <Lock className="mr-1.5 w-4 h-4" />
                Privacy Policy
              </button>
              
              <button 
                onClick={() => openModal('terms')}
                className="text-gray-400 hover:text-indigo-400 text-sm transition-colors font-medium flex items-center"
                aria-label="View terms of service"
              >
                <FileText className="mr-1.5 w-4 h-4" />
                Terms of Service
              </button>
            </div>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {activeModal === 'report' && <ReportIssueModal onClose={closeModal} />}
        
        {activeModal === 'privacy' && (
          <PolicyModal 
            title="Privacy Policy" 
            onClose={closeModal}
            content={
              <>
                <h3 className="text-lg font-semibold mt-4">1. Introduction</h3>
                <p>Promptmakers ("we", "us", or "our") operates the Promptmakers web application (the "Service"). This Privacy Policy informs you of our policies regarding the collection, use, and disclosure of personal data when you use our Service and the choices you have associated with that data.</p>
                
                <h3 className="text-lg font-semibold mt-6">2. Data Collection and Use</h3>
                <p>We collect several different types of information for various purposes to provide and improve our Service to you.</p>
                
                <h4 className="font-medium mt-4">Types of Data Collected:</h4>
                <ul className="list-disc pl-6">
                  <li><strong>Prompt Data:</strong> Your prompt templates and variables are stored locally in your browser's localStorage. We do not have access to this data unless you explicitly share it with us.</li>
                  <li><strong>Usage Data:</strong> When you generate AI responses, your prompt is sent to our backend service which securely forwards it to AI providers (Google Gemini, DeepSeek). We do not log or store the content of these requests.</li>
                  <li><strong>Technical Data:</strong> We may collect information such as your browser type, browser version, and other diagnostic data to monitor Service usage and performance.</li>
                </ul>
                
                <h3 className="text-lg font-semibold mt-6">3. Data Security</h3>
                <p>The security of your data is important to us. We implement appropriate technical and organizational measures to protect against unauthorized access, alteration, disclosure, or destruction of your personal data stored locally in your browser.</p>
                
                <h3 className="text-lg font-semibold mt-6">4. Third-Party Services</h3>
                <p>We use third-party AI providers to process your prompts. These providers have their own privacy policies addressing how they use your data. We recommend you review their privacy policies:</p>
                <ul className="list-disc pl-6">
                  <li>Google Gemini: https://policies.google.com/privacy</li>
                  <li>DeepSeek: https://deepseek.com/privacy</li>
                </ul>
                
                <h3 className="text-lg font-semibold mt-6">5. Changes to This Privacy Policy</h3>
                <p>We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page. Changes are effective immediately after they are posted.</p>
              </>
            }
          />
        )}
        
        {activeModal === 'terms' && (
          <PolicyModal 
            title="Terms of Service" 
            onClose={closeModal}
            content={
              <>
                <h3 className="text-lg font-semibold mt-4">1. Acceptance of Terms</h3>
                <p>By accessing or using the Promptmakers service ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of the terms, you may not access the Service.</p>
                
                <h3 className="text-lg font-semibold mt-6">2. Use License</h3>
                <p>Permission is granted to temporarily use the Service for personal and commercial purposes. This is the grant of a license, not a transfer of title, and under this license you may not:</p>
                <ul className="list-disc pl-6">
                  <li>Modify or copy the Service's code or functionality</li>
                  <li>Use the Service for any illegal purpose</li>
                  <li>Attempt to reverse engineer any software contained in the Service</li>
                  <li>Remove any copyright or other proprietary notations</li>
                </ul>
                
                <h3 className="text-lg font-semibold mt-6">3. Intellectual Property</h3>
                <p>The Service and its original content, features, and functionality are and will remain the exclusive property of Promptmakers and its licensors. Your prompt templates and generated content belong to you.</p>
                
                <h3 className="text-lg font-semibold mt-6">4. User Responsibilities</h3>
                <p>You agree not to use the Service to:</p>
                <ul className="list-disc pl-6">
                  <li>Generate illegal, harmful, abusive, or discriminatory content</li>
                  <li>Impersonate any person or entity</li>
                  <li>Violate any applicable laws or regulations</li>
                  <li>Interfere with or disrupt the Service</li>
                </ul>
                
                <h3 className="text-lg font-semibold mt-6">5. Limitation of Liability</h3>
                <p>In no event shall Promptmakers, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.</p>
                
                <h3 className="text-lg font-semibold mt-6">6. Governing Law</h3>
                <p>These Terms shall be governed and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law provisions.</p>
                
                <h3 className="text-lg font-semibold mt-6">7. Changes</h3>
                <p>We reserve the right, at our sole discretion, to modify or replace these Terms at any time. By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms.</p>
              </>
            }
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default Footer;
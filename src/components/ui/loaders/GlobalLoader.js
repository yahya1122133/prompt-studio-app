import React from 'react';
import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion'; // Add motion for a smoother entry

// Give the component a name
const GlobalLoader = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 flex items-center justify-center bg-gray-900 z-50"
  >
    <div className="flex flex-col items-center gap-4">
      <Sparkles className="w-12 h-12 text-indigo-500 animate-pulse" />
      <p className="text-gray-400">Loading Prompt Studio...</p>
    </div>
  </motion.div>
);

// Use a default export
export default GlobalLoader;

import React from 'react';
import { Loader2 } from 'lucide-react'; // Using Loader2 for a better spinning animation
import { motion } from 'framer-motion';

// Give the component a name
const ModalLoader = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
  >
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring' }}
      className="flex items-center justify-center"
    >
      <Loader2 className="w-12 h-12 text-gray-400 animate-spin" />
    </motion.div>
  </motion.div>
);

// Use a default export
export default ModalLoader;

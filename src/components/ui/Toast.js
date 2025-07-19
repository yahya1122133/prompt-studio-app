import React from 'react';
import { motion } from 'framer-motion'; // Added for animation

// Give the component a proper name (e.g., Toast) instead of being an anonymous arrow function
const Toast = ({ message, type, onExit }) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 50, scale: 0.3 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
    className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-md shadow-lg text-white ${
      type === 'success' ? 'bg-green-600' : 
      type === 'error' ? 'bg-red-600' : 'bg-indigo-600'
    }`}
    role="status"
  >
    {message}
  </motion.div>
);

// Change this:
// export default ({ message, type }) => ( ... );

// To this:
export default Toast;

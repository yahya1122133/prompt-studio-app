import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import clsx from 'clsx';
import { FiLoader } from 'react-icons/fi';

const Button = forwardRef(({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = false,
  className = '',
  ...props
}, ref) => {
  const isDisabled = disabled || loading;
  
  // Use the original classes from index.css
  const getButtonClasses = (variant) => {
    switch (variant) {
      case 'primary':
        return 'btn-primary';
      case 'secondary':
        return 'btn-secondary';
      case 'danger':
        return 'px-4 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all bg-red-600/90 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 active:scale-95';
      case 'ghost':
        return 'px-4 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all bg-transparent text-gray-300 hover:bg-white/5 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 active:scale-95';
      case 'premium':
        return 'px-4 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:from-amber-600 hover:to-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 active:scale-95';
      default:
        return 'btn-primary';
    }
  };
  
  // Size adjustments for original style
  const sizeAdjustments = {
    sm: 'text-xs px-3 py-1.5',
    md: '', // default size from btn-primary/btn-secondary
    lg: 'text-base px-6 py-3',
    icon: 'p-2'
  };

  return (
    <button
      ref={ref}
      className={clsx(
        getButtonClasses(variant),
        size !== 'md' && sizeAdjustments[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={isDisabled}
      {...props}
    >
      {iconPosition === 'left' && (icon || loading) && (
        <span className="flex items-center justify-center">
          {loading ? (
            <FiLoader className="animate-spin" size={16} />
          ) : (
            icon
          )}
        </span>
      )}
      
      {children}
      
      {iconPosition === 'right' && (icon || loading) && (
        <span className="flex items-center justify-center">
          {loading ? (
            <FiLoader className="animate-spin" size={16} />
          ) : (
            icon
          )}
        </span>
      )}
    </button>
  );
});

Button.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['primary', 'secondary', 'danger', 'ghost', 'premium']),
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'icon']),
  icon: PropTypes.node,
  iconPosition: PropTypes.oneOf(['left', 'right']),
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  fullWidth: PropTypes.bool,
  className: PropTypes.string,
};

Button.displayName = 'Button';

export default Button;

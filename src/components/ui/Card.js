import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import clsx from 'clsx';


const Card = forwardRef(({
  children,
  title,
  icon,
  className = '',
  actions,
  hoverable = true,
  loading = false,
  loadingSkeleton = false,
  elevation = 4,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={clsx(
        'bg-gray-800/50 border border-white/10 rounded-xl shadow-sm overflow-hidden',
        hoverable && 'hover:border-white/20 transition-colors duration-300',
        className
      )}
      {...props}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          {title && (
            <div className="flex items-center gap-2">
              {icon && <span className="text-gray-400">{icon}</span>}
              <h2 className="text-lg font-semibold text-white truncate">{title}</h2>
            </div>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      
      <div className="p-4 text-gray-300">
        {loading ? (
          loadingSkeleton ? (
            <div className="space-y-3">
              <div className="h-4 bg-gray-700/50 rounded animate-pulse" />
              <div className="h-4 bg-gray-700/50 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-gray-700/50 rounded animate-pulse w-1/2" />
            </div>
          ) : (
            <div className="flex justify-center py-4">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )
        ) : children}
      </div>
    </div>
  );
});

Card.propTypes = {
  children: PropTypes.node,
  title: PropTypes.string,
  icon: PropTypes.node,
  className: PropTypes.string,
  actions: PropTypes.node,
  hoverable: PropTypes.bool,
  loading: PropTypes.bool,
  loadingSkeleton: PropTypes.bool,
  elevation: PropTypes.number,
};

Card.displayName = 'Card';

export default Card; 
import lazyWithRetry from './utils/lazyWithRetry';

// UI Components
export const Button = lazyWithRetry(() => import('./ui/Button'));
export const Card = lazyWithRetry(() => import('./ui/Card'));
export const Toast = lazyWithRetry(() => import('./ui/Toast'));

// Layout Components
export const Footer = lazyWithRetry(() => import('./layouts/Footer'));
export const Header = lazyWithRetry(() => import('./layouts/Header'));
export const Sidebar = lazyWithRetry(() => import('./layouts/Sidebar'));

// Feature Components
export const PromptLibrary = lazyWithRetry(() => import('./features/PromptLibrary'));
export const DeleteConfirmation = lazyWithRetry(() => import('./features/DeleteConfirmation'));
export const PromptRating = lazyWithRetry(() => import('./features/PromptRating'));
export const UserProfile = lazyWithRetry(() => import('./features/UserProfile'));

// Loaders
export const GlobalLoader = lazyWithRetry(() => import('./ui/loaders/GlobalLoader'));
export const ModalLoader = lazyWithRetry(() => import('./ui/loaders/ModalLoader'));
export const SkeletonLoader = lazyWithRetry(() => import('./ui/loaders/SkeletonLoader'));

// Error Handling
export const ErrorBoundary = lazyWithRetry(() => import('./ui/loaders/ErrorBoundary'));
export const NetworkErrorFallback = lazyWithRetry(() => import('./ui/loaders/NetworkErrorFallback'));

// Assign display names for debugging
const components = {
  Button, Card, Toast, 
  Footer, Header, Sidebar,
  PromptLibrary, DeleteConfirmation, PromptRating, UserProfile,
  GlobalLoader, ModalLoader, SkeletonLoader,
  ErrorBoundary, NetworkErrorFallback
};

Object.entries(components).forEach(([name, component]) => {
  component.displayName = `Lazy${name}`;
});
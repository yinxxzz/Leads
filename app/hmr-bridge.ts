// HMR Bridge for Next.js
// This file enables hot module replacement in the development environment

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // Next.js has built-in HMR support, so we just need to ensure it's enabled
  console.log('HMR Bridge: Next.js hot reload is enabled');
}

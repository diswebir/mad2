// CommonJS entry point compatible with cPanel / Passenger.
import('./server/index.js').catch((error) => {
  console.error('Application startup failed:', error);
  process.exit(1);
});

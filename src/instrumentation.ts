export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' || !process.env.NEXT_RUNTIME) {
    const isBuildPhase =
      process.env.NEXT_PHASE === 'phase-production-build' ||
      process.env.npm_lifecycle_event === 'build';

    const dbUrl = process.env.DATABASE_URL ? process.env.DATABASE_URL.trim() : '';

    if (!isBuildPhase && !dbUrl) {
      const errorMsg =
        'CRITICAL DATABASE CONFIGURATION ERROR: DATABASE_URL is missing or empty.\n' +
        'The financial dashboard requires a valid PostgreSQL database connection string to start.\n' +
        'Please define DATABASE_URL in your environment or .env file before running the server.';

      console.error('\n' + '='.repeat(80));
      console.error(errorMsg);
      console.error('='.repeat(80) + '\n');
      throw new Error(errorMsg);
    }
  }
}

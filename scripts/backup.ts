import {
  checkPostgresTools, createBackup, databaseUrl, ensureSeparateKey, generateBackupKey,
  privatePath, readBackupKey, restoreBackup, toolOptions,
} from './backup-utils';
import { loadLocalEnv } from './load-env';

async function main() {
  loadLocalEnv();
  const [action = 'create', argument] = process.argv.slice(2);
  if (action === 'keygen') {
    if (!argument) throw new Error('Usage: npm run backup:key -- "C:\\PrivateKeys\\dashboard.backup-key"');
    await generateBackupKey(argument);
    console.log('Private backup key created without overwriting an existing file. Make a separate offline copy; losing it makes backups unrecoverable.');
    return;
  }
  if (!['create', 'restore', 'check'].includes(action)) throw new Error('Supported backup actions: create, restore, check, keygen.');
  const keyFile = privatePath(process.env.BACKUP_KEY_FILE, 'BACKUP_KEY_FILE');
  const key = await readBackupKey(keyFile);
  const tools = toolOptions();
  try {
    if (action === 'restore') {
      if (!argument) throw new Error('Usage: npm run backup:restore -- "C:\\FinancialBackups\\file.finbackup"');
      const control = databaseUrl(process.env.RESTORE_DATABASE_URL, 'RESTORE_DATABASE_URL');
      const result = await restoreBackup(argument, control, key, tools);
      console.log(`Restored into NEW database ${result.name}. No existing database was overwritten.`);
      console.log('Restored sessions, SMS tokens and login attempts were cleared. Verify the copy before any manual application cutover.');
      return;
    }
    const source = databaseUrl(process.env.DATABASE_URL, 'DATABASE_URL');
    const directory = privatePath(process.env.BACKUP_DIRECTORY, 'BACKUP_DIRECTORY');
    ensureSeparateKey(directory, keyFile);
    if (action === 'check') {
      await checkPostgresTools(source, tools);
      console.log('Backup configuration and PostgreSQL tools are ready. No database was accessed or backed up.');
      return;
    }
    const file = await createBackup(source, directory, key, tools);
    console.log(`Encrypted backup completed: ${file}`);
    console.log('No older backup was deleted. Keep a separate offline key copy and test restoration regularly.');
  } finally { key.fill(0); }
}

main().catch((error: unknown) => {
  const code = typeof error === 'object' && error !== null ? (error as { code?: string }).code : undefined;
  const message = error instanceof Error ? error.message : 'Backup operation failed.';
  console.error(code ? `Backup operation failed (${code}). Check tools, file access and database configuration.` : message);
  process.exitCode = 1;
});

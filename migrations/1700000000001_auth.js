/**
 * Migration 1700000000001 — Auth & Profile (Phase 2)
 *
 * Adds:
 *  - profile columns (dob, phone_number, country) to users
 *  - password_hash column to users
 *  - sessions table (httpOnly cookie, 30-day expiry)
 *  - ingest_tokens table (hashed, per-user API tokens for M-Pesa import)
 *  - login_attempts table (rate limiting)
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── 1. Extend users table ────────────────────────────────────────────────
  pgm.addColumns('users', {
    password_hash: { type: 'VARCHAR(255)', notNull: false },
    dob: { type: 'DATE', notNull: false },
    // phone_number already exists from Phase 1 schema — skip
    // country already exists from Phase 1 schema — skip
  });

  // ── 2. Sessions ──────────────────────────────────────────────────────────
  pgm.createTable('sessions', {
    id: { type: 'VARCHAR(64)', primaryKey: true }, // random hex token
    user_id: {
      type: 'INTEGER',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    expires_at: { type: 'TIMESTAMP WITH TIME ZONE', notNull: true },
    created_at: {
      type: 'TIMESTAMP WITH TIME ZONE',
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('sessions', 'user_id');
  pgm.createIndex('sessions', 'expires_at');

  // ── 3. Ingest tokens (hashed) ─────────────────────────────────────────
  pgm.createTable('ingest_tokens', {
    id: 'id', // SERIAL PRIMARY KEY
    user_id: {
      type: 'INTEGER',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    token_hash: { type: 'VARCHAR(255)', notNull: true }, // argon2id hash
    label: { type: 'VARCHAR(100)', notNull: false },
    last_used_at: { type: 'TIMESTAMP WITH TIME ZONE', notNull: false },
    created_at: {
      type: 'TIMESTAMP WITH TIME ZONE',
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  pgm.createIndex('ingest_tokens', 'user_id');

  // ── 4. Login rate-limit tracking ─────────────────────────────────────
  pgm.createTable('login_attempts', {
    id: 'id',
    identifier: { type: 'VARCHAR(255)', notNull: true }, // email or IP
    attempted_at: {
      type: 'TIMESTAMP WITH TIME ZONE',
      default: pgm.func('CURRENT_TIMESTAMP'),
      notNull: true,
    },
    succeeded: { type: 'BOOLEAN', default: false, notNull: true },
  });

  pgm.createIndex('login_attempts', ['identifier', 'attempted_at']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('login_attempts');
  pgm.dropTable('ingest_tokens');
  pgm.dropTable('sessions');
  pgm.dropColumns('users', ['password_hash', 'dob']);
};

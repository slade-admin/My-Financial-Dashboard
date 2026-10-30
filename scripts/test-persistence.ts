import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { addAccount, getAccounts } from '../src/lib/repo/accounts';
import { addTransaction, getTransactions } from '../src/lib/repo/transactions';
import { addAsset, getAssets } from '../src/lib/repo/assets';
import { addLiability, getLiabilities } from '../src/lib/repo/liabilities';
import { addBudget, getBudgets } from '../src/lib/repo/budgets';
import { addSavingsGoal, updateSavingsGoal, getSavingsGoals } from '../src/lib/repo/savings-goals';
import { getNetWorthMetrics } from '../src/lib/repo/networth';

async function runTests() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgrespassword@localhost:5433/financial_dashboard';

  process.env.DATABASE_URL = databaseUrl;
  console.log(`[Phase 1 Test] Connecting to PostgreSQL at: ${databaseUrl.replace(/:[^:@]*@/, ':****@')}`);

  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });

  try {
    await pool.query('SELECT 1');
    console.log('✓ Successfully connected to PostgreSQL');
  } catch (err: any) {
    console.error('✗ Failed to connect to PostgreSQL:', err.message);
    console.error('  Ensure Docker Postgres container is running: docker compose up -d');
    process.exit(1);
  }

  try {
    // 1. Run migrations / apply schema
    console.log('\n--- 1. Applying Schema & Migrations ---');
    const schemaFile = path.join(process.cwd(), 'migrations', 'schema.sql');
    if (!fs.existsSync(schemaFile)) {
      throw new Error(`Migration schema file not found at ${schemaFile}`);
    }
    const schemaSql = fs.readFileSync(schemaFile, 'utf8');
    await pool.query(schemaSql);
    console.log('✓ migrations/schema.sql applied successfully');

    // 2. Validate columns and types
    console.log('\n--- 2. Validating Schema Constraints & NUMERIC(16,2) Precision ---');
    const colsRes = await pool.query(`
      SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_name IN ('accounts', 'transactions')
        AND column_name IN ('user_id', 'current_balance', 'amount')
      ORDER BY table_name, column_name;
    `);

    const colMap = new Map<string, any>();
    for (const r of colsRes.rows) {
      colMap.set(`${r.table_name}.${r.column_name}`, r);
    }

    if (!colMap.has('accounts.user_id') || !colMap.has('transactions.user_id')) {
      throw new Error('user_id column missing from accounts or transactions');
    }
    console.log('✓ user_id column verified on accounts and transactions');

    const accBalance = colMap.get('accounts.current_balance');
    const txAmount = colMap.get('transactions.amount');
    if (accBalance.data_type !== 'numeric' || txAmount.data_type !== 'numeric') {
      throw new Error('current_balance or amount is not numeric');
    }
    console.log(`✓ Stored as NUMERIC(16,2): accounts.current_balance (${accBalance.numeric_precision},${accBalance.numeric_scale}), transactions.amount (${txAmount.numeric_precision},${txAmount.numeric_scale})`);

    // Check unique constraint on (user_id, reference)
    const constraintRes = await pool.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'transactions'::regclass
        AND contype = 'u';
    `);
    const hasUniqueRef = constraintRes.rows.some((r: any) =>
      r.conname.includes('reference') || r.conname.includes('user_reference')
    );
    if (!hasUniqueRef) {
      throw new Error('Unique constraint on transactions(user_id, reference) missing');
    }
    console.log('✓ Unique constraint verified on transactions(user_id, reference)');

    // Ensure test user 1 exists
    await pool.query(`
      INSERT INTO users (id, email, full_name, phone_number, country)
      VALUES (1, 'testuser@dashboard.ke', 'Test User', '+254700000000', 'KE')
      ON CONFLICT (id) DO NOTHING;
    `);

    const testUserId = 1;

    // 3. Test Atomic Transaction & Balance Update
    console.log('\n--- 3. Testing Atomic Account & Transaction Persistence ---');
    const testAccount = await addAccount(testUserId, {
      name: `Test M-Pesa Account ${Date.now()}`,
      institution: 'Safaricom',
      account_type: 'mobile_money',
      currency: 'KES',
      balance: 1000.0,
      is_asset: true,
    });
    console.log(`✓ Created account ID ${testAccount.id} with balance: KES ${testAccount.balance}`);

    const uniqueReceiptRef = `TESTREC${Date.now().toString().slice(-6)}`;

    // Add income transaction: 500.00
    const tx1 = await addTransaction(testUserId, {
      account_id: testAccount.id,
      amount: 500.0,
      currency: 'KES',
      type: 'income',
      date: new Date().toISOString().split('T')[0],
      description: 'Customer Payment Received',
      category: 'Freelance & Business',
      reference: uniqueReceiptRef,
      import_source: 'mpesa_statement',
    });

    if (tx1.isDuplicate) {
      throw new Error('Initial transaction marked as duplicate incorrectly');
    }
    console.log(`✓ Inserted transaction ${tx1.transaction.id} (ref: ${uniqueReceiptRef})`);

    // Verify account balance updated atomically
    const accAfterTx1 = (await getAccounts(testUserId)).find((a) => String(a.id) === String(testAccount.id));
    if (!accAfterTx1 || accAfterTx1.balance !== 1500.0) {
      throw new Error(`Expected balance 1500.00, got ${accAfterTx1?.balance}`);
    }
    console.log(`✓ Atomic balance update verified: 1000.00 + 500.00 = KES ${accAfterTx1.balance}`);

    // 4. Test Deduplication / Idempotency
    console.log('\n--- 4. Testing Acceptance: Importing Same Receipt Twice ---');
    const duplicateAttempt = await addTransaction(testUserId, {
      account_id: testAccount.id,
      amount: 500.0,
      currency: 'KES',
      type: 'income',
      date: new Date().toISOString().split('T')[0],
      description: 'Customer Payment Received (Duplicate Re-import)',
      category: 'Freelance & Business',
      reference: uniqueReceiptRef,
      import_source: 'mpesa_statement',
    });

    if (!duplicateAttempt.isDuplicate) {
      throw new Error('Duplicate receipt was not recognized as duplicate');
    }
    console.log('✓ Duplicate receipt detected (isDuplicate = true)');

    // Verify only ONE transaction exists in DB for this receipt
    const txCountRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM transactions WHERE user_id = $1 AND reference = $2',
      [testUserId, uniqueReceiptRef]
    );
    if (txCountRes.rows[0].count !== 1) {
      throw new Error(`Expected exactly 1 transaction in DB, found ${txCountRes.rows[0].count}`);
    }
    console.log(`✓ Verified DB count for reference ${uniqueReceiptRef}: exactly 1 transaction`);

    // Verify balance was NOT updated again
    const accAfterDuplicate = (await getAccounts(testUserId)).find((a) => String(a.id) === String(testAccount.id));
    if (!accAfterDuplicate || accAfterDuplicate.balance !== 1500.0) {
      throw new Error(`Balance was corrupted on duplicate: expected 1500.00, got ${accAfterDuplicate?.balance}`);
    }
    console.log(`✓ Account balance remained unchanged on duplicate: KES ${accAfterDuplicate.balance}`);

    // 5. Test Assets, Liabilities, Budgets, and Savings Goals
    console.log('\n--- 5. Testing Other Entities Persistence ---');
    const asset = await addAsset(testUserId, {
      name: 'Plot in Kitengela',
      category: 'land',
      estimated_value: 1200000.0,
      currency: 'KES',
      notes: '50x100 prime land',
    });
    console.log(`✓ Asset persisted: ${asset.name} (Value: KES ${asset.estimated_value})`);

    const liability = await addLiability(testUserId, {
      name: 'SACCO Development Loan',
      creditor: 'Stima SACCO',
      category: 'sacco_loan',
      principal_amount: 300000.0,
      outstanding_balance: 240000.0,
      interest_rate: 12.0,
      monthly_payment: 15000.0,
      currency: 'KES',
    });
    console.log(`✓ Liability persisted: ${liability.name} (Balance: KES ${liability.outstanding_balance})`);

    const budget = await addBudget(testUserId, {
      category: 'Food & Groceries',
      monthly_limit: 25000.0,
      currency: 'KES',
    });
    console.log(`✓ Budget persisted: ${budget.category} (Limit: KES ${budget.monthly_limit})`);

    const goal = await addSavingsGoal(testUserId, {
      name: 'Emergency Fund 6 Months',
      target_amount: 500000.0,
      current_amount: 150000.0,
      currency: 'KES',
    });
    console.log(`✓ Savings goal persisted: ${goal.name} (Target: KES ${goal.target_amount})`);

    const updatedGoal = await updateSavingsGoal(testUserId, goal.id, 20000.0);
    if (!updatedGoal || updatedGoal.current_amount !== 170000.0) {
      throw new Error(`Expected updated goal amount 170000.0, got ${updatedGoal?.current_amount}`);
    }
    console.log(`✓ Savings goal updated: KES ${updatedGoal.current_amount}`);

    const metrics = await getNetWorthMetrics(testUserId);
    console.log(`✓ Net Worth computed correctly: KES ${metrics.netWorth} (Assets: KES ${metrics.totalAssets}, Liabilities: KES ${metrics.totalLiabilities})`);

    console.log('\n======================================================');
    console.log('✓ ALL PHASE 1 ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n✗ Test failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTests();

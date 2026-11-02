import { query } from '../db';
import { PersonalAsset, toMoney, DbRow} from './types';

export async function getAssets(userId: number): Promise<PersonalAsset[]> {
  const res = await query(
    'SELECT * FROM assets WHERE user_id = $1 ORDER BY id ASC',
    [userId]
  );
  return res.rows.map(mapAssetRow);
}

export async function addAsset(
  userId: number,
  asset: Omit<PersonalAsset, 'id'>
): Promise<PersonalAsset> {
  const res = await query(
    `INSERT INTO assets (user_id, name, category, estimated_value, currency, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      userId,
      asset.name,
      asset.category,
      toMoney(asset.estimated_value),
      asset.currency || 'KES',
      asset.notes || null,
    ]
  );
  return mapAssetRow(res.rows[0]);
}

function mapAssetRow(r: DbRow): PersonalAsset {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    estimated_value: toMoney(r.estimated_value),
    currency: r.currency || 'KES',
    notes: r.notes || undefined,
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
  };
}

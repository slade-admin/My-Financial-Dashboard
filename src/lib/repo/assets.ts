import { query } from '../db';
import { PersonalAsset, toMoney, DbRow} from './types';
import { moneyInput, requireKES } from '../money';
import { choiceInput, textInput } from '../validation';
import { auditedTransaction, editRecord, insertRecord } from './history';

type AssetDetails = Omit<PersonalAsset, 'id'>;

function assetDetails(asset: AssetDetails) {
  return {
    name: textInput(asset.name, 'Asset name', 255),
    category: choiceInput(asset.category,
      ['real_estate', 'vehicle', 'investments', 'land', 'livestock', 'valuables', 'other'], 'asset category'),
    estimated_value: moneyInput(asset.estimated_value, 'Asset value', { allowZero: true }),
    currency: requireKES(asset.currency),
    notes: textInput(asset.notes, 'Notes', 5000, true) || null,
  };
}

export async function getAssets(userId: number): Promise<PersonalAsset[]> {
  const res = await query(
    'SELECT * FROM assets WHERE user_id = $1 ORDER BY id ASC',
    [userId]
  );
  return res.rows.map(mapAssetRow);
}

export async function addAsset(
  userId: number,
  asset: Omit<PersonalAsset, 'id'> & { request_id?: string }
): Promise<PersonalAsset> {
  const details = assetDetails(asset);
  return auditedTransaction('Asset created', async (client) =>
    mapAssetRow((await insertRecord(client, userId, 'assets', details, asset.request_id)).row));
}

export async function updateAsset(userId: number, id: string | number, asset: AssetDetails, version: unknown, reason: string) {
  return mapAssetRow(await editRecord(userId, 'assets', id, version, assetDetails(asset), reason));
}

function mapAssetRow(r: DbRow): PersonalAsset {
  return {
    id: r.id,
    version: r.version,
    name: r.name,
    category: r.category,
    estimated_value: toMoney(r.estimated_value),
    currency: r.currency || 'KES',
    notes: r.notes || undefined,
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
  };
}

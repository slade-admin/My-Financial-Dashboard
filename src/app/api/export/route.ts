import { currentUserId } from '@/lib/session';
import { apiError } from '@/lib/errors';
import { exportFinancialData } from '@/lib/repo/export';

export async function GET() {
  try {
    const data = await exportFinancialData(await currentUserId());
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="finance-export-${data.exported_at.slice(0, 10)}.json"`,
        'Cache-Control': 'private, no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) { return apiError(error, 'GET /api/export'); }
}

import { type NextRequest, NextResponse } from 'next/server';
import { rawQuery } from './lib/db-helpers';

export async function GET(request: NextRequest) {
  try {
    const existingProject = await rawQuery("SELECT 'HELLO WORLD'");
    return NextResponse.json(existingProject);
  } catch (_error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

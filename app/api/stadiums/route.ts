import { NextResponse } from 'next/server';
import { STADIUMS } from '@/data/stadiums';

export async function GET() {
    return NextResponse.json({ stadiums: STADIUMS });
}

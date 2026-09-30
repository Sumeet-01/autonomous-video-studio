import { type NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  // Skip session refresh when Supabase is not configured so local-only
  // development works without keys.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    const { NextResponse } = await import('next/server');
    return NextResponse.next({ request });
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files, images and favicons.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

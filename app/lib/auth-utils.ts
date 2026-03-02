import { auth } from '@/auth';
import { prisma } from './prisma';
import type { Session } from 'next-auth';

/**
 * Get user ID from session with fallback to email lookup
 * Eliminates the need for repeated (session.user as any).id patterns
 */
export async function getUserIdFromSession(session: Session | null): Promise<string | null> {
  if (!session?.user) return null;
  
  // Try direct ID first (from extended session)
  if ('id' in session.user && session.user.id) {
    return session.user.id as string;
  }
  
  // Fallback to email lookup
  if (session.user.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    });
    return user?.id || null;
  }
  
  return null;
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(): Promise<Session> {
  const session = await auth();
  if (!session?.user?.email) {
    throw new Error('Not authenticated');
  }
  return session;
}

/**
 * Require authenticated user ID - throws if not found
 */
export async function requireUserId(): Promise<{ userId: string; session: Session }> {
  const session = await requireAuth();
  const userId = await getUserIdFromSession(session);
  
  if (!userId) {
    throw new Error('User not found in database');
  }
  
  return { userId, session };
}

/**
 * Require admin privileges
 */
export async function requireAdmin(): Promise<{ userId: string; session: Session }> {
  const { userId, session } = await requireUserId();
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true }
  });
  
  if (!user?.isAdmin) {
    throw new Error('Admin privileges required');
  }
  
  return { userId, session };
}

/**
 * Get current user with full details
 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.email) return null;
  
  const userId = await getUserIdFromSession(session);
  if (!userId) return null;
  
  return await prisma.user.findUnique({
    where: { id: userId }
  });
}

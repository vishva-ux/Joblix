import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'joblix_super_secret_session_key_987654321';

export interface AuthRequest extends Request {
  userId?: string;
  projectId?: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}

export async function apiKeyMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(401).json({ error: 'Unauthorized: Missing API Key' });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { apiKey }
    });

    if (!project) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }

    req.projectId = project.id;
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error during api-key check' });
  }
}

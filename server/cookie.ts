import { Request } from 'express';
import { Socket } from 'socket.io';

export function parseCookieHeader(header?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  header.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    if (name) {
      cookies[name] = decodeURI(parts.join('='));
    }
  });
  return cookies;
}

export function getCookieFromRequest(req: Request, name: string): string | undefined {
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[name];
}

export function getCookieFromSocket(socket: Socket, name: string): string | undefined {
  const cookies = parseCookieHeader(socket.request.headers.cookie);
  return cookies[name];
}

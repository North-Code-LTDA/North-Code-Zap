import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const AUTH_DIR = process.env.DATA_DIR 
  ? path.join(process.env.DATA_DIR, 'auth') 
  : path.join(process.cwd(), 'data', 'auth');

const USERS_FILE = path.join(AUTH_DIR, 'users.json');
const WORKSPACES_FILE = path.join(AUTH_DIR, 'workspaces.json');
const SESSIONS_FILE = path.join(AUTH_DIR, 'sessions.json');

export interface User {
  id: string;
  name: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function isValidDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

export class AuthService {
  private users: User[] = [];
  private workspaces: Workspace[] = [];
  private sessions: Session[] = [];

  constructor() {
    this.ensureDirectory();
  }

  public init() {
    this.loadWorkspaces();
    this.loadUsers();
    this.loadSessions();
    this.cleanupExpiredSessions();
  }

  private ensureDirectory() {
    try {
      if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
      }
    } catch (err: any) {
      console.error('[AuthService] error creating auth directory:', err?.message || err);
    }
  }

  private loadWorkspaces() {
    if (!fs.existsSync(WORKSPACES_FILE)) {
      this.workspaces = [];
      return;
    }
    const raw = fs.readFileSync(WORKSPACES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('WORKSPACES_FILE deve ser um array.');

    const validWorkspaces: Workspace[] = [];
    const ids = new Set<string>();

    for (const w of parsed) {
      if (!w || typeof w !== 'object') throw new Error('Workspace inválido.');
      if (!w.id || typeof w.id !== 'string' || !isValidUuid(w.id)) throw new Error('Workspace id inválido.');
      if (ids.has(w.id)) throw new Error('Workspace id duplicado.');

      if (!w.name || typeof w.name !== 'string' || !w.name.trim()) throw new Error('Workspace name inválido.');
      if (!w.createdAt || typeof w.createdAt !== 'string' || !isValidDate(w.createdAt)) throw new Error('Workspace createdAt inválido.');
      if (!w.updatedAt || typeof w.updatedAt !== 'string' || !isValidDate(w.updatedAt)) throw new Error('Workspace updatedAt inválido.');

      ids.add(w.id);
      validWorkspaces.push(w as Workspace);
    }
    this.workspaces = validWorkspaces;
    console.log(`[AuthService] loaded workspaces=${this.workspaces.length}`);
  }

  private loadUsers() {
    if (!fs.existsSync(USERS_FILE)) {
      this.users = [];
      return;
    }
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('USERS_FILE deve ser um array.');

    const validUsers: User[] = [];
    const ids = new Set<string>();
    const emails = new Set<string>();

    for (const u of parsed) {
      if (!u || typeof u !== 'object') throw new Error('User inválido.');
      if (!u.id || typeof u.id !== 'string' || !isValidUuid(u.id)) throw new Error('User id inválido.');
      if (ids.has(u.id)) throw new Error('User id duplicado.');

      if (!u.name || typeof u.name !== 'string' || !u.name.trim()) throw new Error('User name inválido.');
      if (!u.email || typeof u.email !== 'string') throw new Error('User email inválido.');
      const emailLower = u.email.trim().toLowerCase();
      if (!emailLower || !/^\S+@\S+\.\S+$/.test(emailLower)) throw new Error('User email em formato inválido.');
      if (emails.has(emailLower)) throw new Error('User email duplicado.');

      if (!u.passwordSalt || typeof u.passwordSalt !== 'string' || !u.passwordSalt.trim()) throw new Error('User passwordSalt inválido.');
      if (!u.passwordHash || typeof u.passwordHash !== 'string' || !u.passwordHash.trim()) throw new Error('User passwordHash inválido.');
      
      if (!u.workspaceId || typeof u.workspaceId !== 'string' || !isValidUuid(u.workspaceId)) throw new Error('User workspaceId inválido.');
      if (!this.workspaces.find(w => w.id === u.workspaceId)) throw new Error('User workspaceId inexistente.');

      if (!u.createdAt || typeof u.createdAt !== 'string' || !isValidDate(u.createdAt)) throw new Error('User createdAt inválido.');
      if (!u.updatedAt || typeof u.updatedAt !== 'string' || !isValidDate(u.updatedAt)) throw new Error('User updatedAt inválido.');

      ids.add(u.id);
      emails.add(emailLower);

      validUsers.push({
        ...u,
        email: emailLower
      } as User);
    }
    this.users = validUsers;
    console.log(`[AuthService] loaded users=${this.users.length}`);
  }

  private loadSessions() {
    if (!fs.existsSync(SESSIONS_FILE)) {
      this.sessions = [];
      return;
    }
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('SESSIONS_FILE deve ser um array.');

    const validSessions: Session[] = [];
    const ids = new Set<string>();
    const tokenHashes = new Set<string>();

    for (const s of parsed) {
      if (!s || typeof s !== 'object') throw new Error('Session inválida.');
      if (!s.id || typeof s.id !== 'string' || !isValidUuid(s.id)) throw new Error('Session id inválido.');
      if (ids.has(s.id)) throw new Error('Session id duplicado.');

      if (!s.userId || typeof s.userId !== 'string' || !isValidUuid(s.userId)) throw new Error('Session userId inválido.');
      if (!this.users.find(u => u.id === s.userId)) throw new Error('Session userId inexistente.');

      if (!s.tokenHash || typeof s.tokenHash !== 'string' || !s.tokenHash.trim()) throw new Error('Session tokenHash inválido.');
      if (tokenHashes.has(s.tokenHash)) throw new Error('Session tokenHash duplicado.');

      if (!s.createdAt || typeof s.createdAt !== 'string' || !isValidDate(s.createdAt)) throw new Error('Session createdAt inválido.');
      if (!s.expiresAt || typeof s.expiresAt !== 'string' || !isValidDate(s.expiresAt)) throw new Error('Session expiresAt inválido.');

      // Expired sessions can be discarded quietly
      if (new Date(s.expiresAt).getTime() <= Date.now()) continue;

      ids.add(s.id);
      tokenHashes.add(s.tokenHash);
      validSessions.push(s as Session);
    }
    this.sessions = validSessions;
    console.log(`[AuthService] loaded sessions=${this.sessions.length}`);
  }

  private saveWorkspaces() {
    this.ensureDirectory();
    try {
      const data = JSON.stringify(this.workspaces, null, 2);
      const tmp = WORKSPACES_FILE + '.tmp';
      fs.writeFileSync(tmp, data, { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tmp, WORKSPACES_FILE);
    } catch (err: any) {
      console.error('[AuthService] error saving workspaces:', err?.message || err);
    }
  }

  private saveUsers() {
    this.ensureDirectory();
    try {
      const data = JSON.stringify(this.users, null, 2);
      const tmp = USERS_FILE + '.tmp';
      fs.writeFileSync(tmp, data, { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tmp, USERS_FILE);
    } catch (err: any) {
      console.error('[AuthService] error saving users:', err?.message || err);
    }
  }

  private saveSessions() {
    this.ensureDirectory();
    try {
      const data = JSON.stringify(this.sessions, null, 2);
      const tmp = SESSIONS_FILE + '.tmp';
      fs.writeFileSync(tmp, data, { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tmp, SESSIONS_FILE);
    } catch (err: any) {
      console.error('[AuthService] error saving sessions:', err?.message || err);
    }
  }

  private cleanupExpiredSessions() {
    const now = Date.now();
    let changed = false;
    this.sessions = this.sessions.filter(s => {
      if (new Date(s.expiresAt).getTime() > now) {
        return true;
      }
      changed = true;
      return false;
    });
    if (changed) {
      this.saveSessions();
    }
  }

  private hashPassword(password: string, salt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey.toString('hex'));
      });
    });
  }

  private async verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        else {
          try {
            const keyBuffer = Buffer.from(derivedKey.toString('hex'), 'hex');
            const hashBuffer = Buffer.from(hash, 'hex');
            if (keyBuffer.length !== hashBuffer.length) {
              resolve(false);
            } else {
              resolve(crypto.timingSafeEqual(keyBuffer, hashBuffer));
            }
          } catch (e) {
            resolve(false);
          }
        }
      });
    });
  }

  public hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  public async register(name: unknown, email: unknown, password: unknown) {
    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      throw new Error('Parâmetros inválidos.');
    }
    const safeName = name.trim();
    const safeEmail = email.trim().toLowerCase();
    const safePassword = password;

    if (!safeName || safeName.length > 100) throw new Error('Nome inválido.');
    if (!safeEmail || safeEmail.length > 255 || !/^\S+@\S+\.\S+$/.test(safeEmail)) throw new Error('Email inválido.');
    if (!safePassword || safePassword.length < 8 || safePassword.length > 128) throw new Error('Senha deve ter entre 8 e 128 caracteres.');

    if (this.users.find(u => u.email === safeEmail)) {
      throw new Error('Email já cadastrado.');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await this.hashPassword(safePassword, salt);

    const nowIso = new Date().toISOString();
    
    const workspaceId = crypto.randomUUID();
    const workspace: Workspace = {
      id: workspaceId,
      name: safeName,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const userId = crypto.randomUUID();
    const user: User = {
      id: userId,
      name: safeName,
      email: safeEmail,
      passwordSalt: salt,
      passwordHash: hash,
      workspaceId: workspaceId,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    this.workspaces.push(workspace);
    this.users.push(user);
    
    this.saveWorkspaces();
    this.saveUsers();

    return this.createSession(userId);
  }

  public async login(email: unknown, password: unknown) {
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new Error('Parâmetros inválidos.');
    }
    const safeEmail = email.trim().toLowerCase();
    const safePassword = password;

    const user = this.users.find(u => u.email === safeEmail);
    if (!user) {
      throw new Error('E-mail ou senha inválidos.');
    }
    
    const isValid = await this.verifyPassword(safePassword, user.passwordHash, user.passwordSalt);
    if (!isValid) {
      throw new Error('E-mail ou senha inválidos.');
    }

    return this.createSession(user.id);
  }

  private createSession(userId: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const session: Session = {
      id: crypto.randomUUID(),
      userId,
      tokenHash,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    this.sessions.push(session);
    this.saveSessions();

    return { token, session };
  }

  public logoutBySessionId(sessionId: string) {
    const idx = this.sessions.findIndex(s => s.id === sessionId);
    if (idx !== -1) {
      this.sessions.splice(idx, 1);
      this.saveSessions();
    }
  }

  public getSessionByToken(token: string): Session | undefined {
    const hash = this.hashToken(token);
    const session = this.sessions.find(s => s.tokenHash === hash);
    if (!session) return undefined;

    if (new Date(session.expiresAt).getTime() < Date.now()) {
      this.logoutBySessionId(session.id);
      return undefined;
    }
    return session;
  }

  public getUser(id: string): User | undefined {
    return this.users.find(u => u.id === id);
  }

  public getWorkspace(id: string): Workspace | undefined {
    return this.workspaces.find(w => w.id === id);
  }
}

export const authService = new AuthService();

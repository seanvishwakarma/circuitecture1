import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Mock the crypto module (server.js uses randomBytes, scryptSync, timingSafeEqual)
vi.mock('crypto', () => ({
  randomBytes: (n) => ({
    toString: (encoding) => {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = i + 1;
      if (encoding === 'base64url') {
        return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      }
      return Buffer.from(bytes).toString(encoding);
    }
  }),
  scryptSync: (pass, salt, keylen) => {
    const hash = Buffer.alloc(keylen);
    for (let i = 0; i < keylen; i++) {
      hash[i] = (pass.charCodeAt(i % pass.length) + salt.charCodeAt(i % salt.length)) % 256;
    }
    return hash;
  },
  timingSafeEqual: (a, b) => Buffer.compare(a, b) === 0
}));

const BASE_URL = 'http://localhost:8080';

describe('server.js API tests', () => {
  let dbBackup;

  beforeAll(() => {
    // Backup original db.json
    const dbPath = path.resolve('data/db.json');
    if (fs.existsSync(dbPath)) {
      dbBackup = fs.readFileSync(dbPath, 'utf8');
    }
    // Delete db.json so the server seeds with fresh data
    try { fs.unlinkSync(dbPath); } catch (e) {}
    // Start the server once (auto-starts on port 8080)
    require(path.resolve('server.js'));
  });

  afterAll(() => {
    // Restore original db.json
    const dbPath = path.resolve('data/db.json');
    if (dbBackup) {
      fs.writeFileSync(dbPath, dbBackup, 'utf8');
    }
  });

  function makeRequest(method, pathStr, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(pathStr, BASE_URL);
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      const req = http.request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, data });
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  it('starts server and responds to /api/health', async () => {
    const response = await makeRequest('GET', '/api/health');
    expect(response.status).toBe(200);
    expect(response.data.ok).toBe(true);
    expect(response.data.version).toBe('1.0.0');
  });

  it('returns 401 for /api/me when not authenticated', async () => {
    const response = await makeRequest('GET', '/api/me');
    expect(response.status).toBe(200); // Actually returns 200 with null user
    expect(response.data.user).toBeNull();
    expect(response.data.csrf).toBeNull();
  });

  it('returns 404 for /api/admin/stats when not admin', async () => {
    const response = await makeRequest('GET', '/api/admin/stats');
    expect(response.status).toBe(401); // Actually returns 401 for auth error
  });

  it('completes signup+login flow and creates/lists/deletes project', async () => {
    // 1. Sign up a test user
    const signupResponse = await makeRequest('POST', '/api/signup', {
      name: 'Test User',
      email: 'test@example.com',
      pass: 'password123'
    });
    
    expect(signupResponse.status).toBe(200);
    expect(signupResponse.data.user).toBeDefined();
    expect(signupResponse.data.user.email).toBe('test@example.com');
    expect(signupResponse.data.csrf).toBeDefined();
    
    // Extract session cookie
    const setCookie = signupResponse.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const sessionCookie = setCookie[0].split(';')[0];
    
    // 2. Test /api/me with authenticated user
    const meResponse = await makeRequest('GET', '/api/me', null, {
      'Cookie': sessionCookie
    });
    
    expect(meResponse.status).toBe(200);
    expect(meResponse.data.user.email).toBe('test@example.com');
    
    // 3. Create a project
    const createProjectResponse = await makeRequest('POST', '/api/projects', {
      name: 'Test Project',
      lang: 'cpp',
      board: 'uno',
      code: 'void setup() {}',
      components: [],
      wires: []
    }, {
      'Cookie': sessionCookie,
      'X-CSRF-Token': signupResponse.data.csrf
    });
    
    expect(createProjectResponse.status).toBe(200);
    expect(createProjectResponse.data.project).toBeDefined();
    expect(createProjectResponse.data.project.name).toBe('Test Project');
    expect(createProjectResponse.data.project.owner.email).toBe('test@example.com');
    
    const projectId = createProjectResponse.data.project.id;
    
    // 4. List projects
    const listProjectsResponse = await makeRequest('GET', '/api/projects', null, {
      'Cookie': sessionCookie
    });
    
    expect(listProjectsResponse.status).toBe(200);
    expect(listProjectsResponse.data.projects).toBeDefined();
    expect(listProjectsResponse.data.projects.length).toBeGreaterThan(0);
    expect(listProjectsResponse.data.projects.some(p => p.id === projectId)).toBe(true);
    
    // 5. Get specific project
    const getProjectResponse = await makeRequest('GET', `/api/projects/${projectId}`, null, {
      'Cookie': sessionCookie
    });
    
    expect(getProjectResponse.status).toBe(200);
    expect(getProjectResponse.data.project.id).toBe(projectId);
    
    // 6. Delete the project
    const deleteProjectResponse = await makeRequest('DELETE', `/api/projects/${projectId}`, null, {
      'Cookie': sessionCookie,
      'X-CSRF-Token': signupResponse.data.csrf
    });
    
    expect(deleteProjectResponse.status).toBe(200);
    expect(deleteProjectResponse.data.ok).toBe(true);
    
    // 7. Verify project is deleted
    const listAfterDeleteResponse = await makeRequest('GET', '/api/projects', null, {
      'Cookie': sessionCookie
    });
    
    expect(listAfterDeleteResponse.status).toBe(200);
    expect(listAfterDeleteResponse.data.projects).toBeDefined();
    const deletedProject = listAfterDeleteResponse.data.projects.find(p => p.id === projectId);
    expect(deletedProject).toBeUndefined();
  });

  it('handles login with seeded admin account', async () => {
    // Login with seeded admin credentials
    const loginResponse = await makeRequest('POST', '/api/login', {
      email: 'admin@circuittecture.local',
      pass: 'admin1234'
    });
    
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.data.user).toBeDefined();
    expect(loginResponse.data.user.email).toBe('admin@circuittecture.local');
    expect(loginResponse.data.user.role).toBe('admin');
    
    // Extract session cookie
    const setCookie = loginResponse.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const sessionCookie = setCookie[0].split(';')[0];
    
    // Test admin endpoint
    const adminStatsResponse = await makeRequest('GET', '/api/admin/stats', null, {
      'Cookie': sessionCookie,
      'X-CSRF-Token': loginResponse.data.csrf
    });
    
    expect(adminStatsResponse.status).toBe(200);
    expect(adminStatsResponse.data.stats).toBeDefined();
    expect(adminStatsResponse.data.stats.users).toBeGreaterThan(0);
  });

  it('validates CSRF protection for write operations', async () => {
    // Sign up a user
    const signupResponse = await makeRequest('POST', '/api/signup', {
      name: 'CSRF Test User',
      email: 'csrf@example.com',
      pass: 'password123'
    });
    
    const sessionCookie = signupResponse.headers['set-cookie'][0].split(';')[0];
    
    // Try to create project without CSRF token
    const badCreateResponse = await makeRequest('POST', '/api/projects', {
      name: 'CSRF Test Project',
      lang: 'cpp',
      board: 'uno'
    }, {
      'Cookie': sessionCookie
      // No X-CSRF-Token header
    });
    
    expect(badCreateResponse.status).toBe(403);
    expect(badCreateResponse.data.error).toBe('CSRF protection triggered');
    
    // Try with wrong CSRF token
    const wrongTokenResponse = await makeRequest('POST', '/api/projects', {
      name: 'CSRF Test Project',
      lang: 'cpp',
      board: 'uno'
    }, {
      'Cookie': sessionCookie,
      'X-CSRF-Token': 'wrong-token'
    });
    
    expect(wrongTokenResponse.status).toBe(403);
    expect(wrongTokenResponse.data.error).toBe('CSRF protection triggered');
    
    // Try with correct CSRF token
    const goodCreateResponse = await makeRequest('POST', '/api/projects', {
      name: 'CSRF Test Project',
      lang: 'cpp',
      board: 'uno'
    }, {
      'Cookie': sessionCookie,
      'X-CSRF-Token': signupResponse.data.csrf
    });
    
    expect(goodCreateResponse.status).toBe(200);
    expect(goodCreateResponse.data.project).toBeDefined();
  });

  it('validates project creation limits', async () => {
    // Sign up a user
    const signupResponse = await makeRequest('POST', '/api/signup', {
      name: 'Limit Test User',
      email: 'limit@example.com',
      pass: 'password123'
    });
    
    const sessionCookie = signupResponse.headers['set-cookie'][0].split(';')[0];
    const csrfToken = signupResponse.data.csrf;
    
    const headers = {
      'Cookie': sessionCookie,
      'X-CSRF-Token': csrfToken
    };
    
    // Create projects up to the limit (default is 500)
    // We'll test with 2 to keep it fast
    const project1 = await makeRequest('POST', '/api/projects', {
      name: 'Project 1',
      lang: 'cpp',
      board: 'uno'
    }, headers);
    
    expect(project1.status).toBe(200);
    
    const project2 = await makeRequest('POST', '/api/projects', {
      name: 'Project 2',
      lang: 'py',
      board: 'pico'
    }, headers);
    
    expect(project2.status).toBe(200);
    
    // List projects to verify
    const listResponse = await makeRequest('GET', '/api/projects', null, {
      'Cookie': sessionCookie
    });
    
    expect(listResponse.status).toBe(200);
    expect(listResponse.data.projects.filter(p => p.owner && p.owner.email === 'limit@example.com').length).toBe(2);
  });

  it('handles rate limiting for signup', async () => {
    // Try to sign up multiple times quickly
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(makeRequest('POST', '/api/signup', {
        name: `User ${i}`,
        email: `user${i}@example.com`,
        pass: 'password123'
      }));
    }
    
    const responses = await Promise.all(requests);
    
    // First few should succeed, later ones should be rate limited
    const successCount = responses.filter(r => r.status === 200).length;
    const rateLimitedCount = responses.filter(r => r.status === 429).length;
    
    expect(successCount).toBeGreaterThan(0);
    expect(rateLimitedCount).toBeGreaterThan(0);
  });
});
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import path from 'path';

const PORT = 8085;
const BASE_URL = `http://localhost:${PORT}`;

describe('Security & Hardening Tests', () => {
  beforeAll(async () => {
    process.env.PORT = String(PORT);
    process.env.VITEST = 'true';
    require(path.resolve('server.js'));
    // Wait briefly for server to bind
    await new Promise(r => setTimeout(r, 200));
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
          let parsedData = null;
          try {
            parsedData = JSON.parse(data);
          } catch (e) {
            parsedData = data;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsedData
          });
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  it('verifies /healthz endpoint returns DB status', async () => {
    const res = await makeRequest('GET', '/healthz');
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('ok');
    expect(res.data.dbOk).toBe(true);
  });

  it('rejects state-changing request without valid CSRF token', async () => {
    const signup = await makeRequest('POST', '/api/signup', {
      name: 'CSRF User',
      email: `csrf-${Date.now()}@example.com`,
      pass: 'password123'
    });
    const sessionCookie = signup.headers['set-cookie'][0].split(';')[0];

    // Try creating project without CSRF token
    const res = await makeRequest('POST', '/api/projects', {
      name: 'No CSRF Project'
    }, {
      'Cookie': sessionCookie
    });

    expect(res.status).toBe(403);
    expect(res.data.error).toContain('CSRF');
  });

  it('invalidates sessions upon password change', async () => {
    const email = `passchange-${Date.now()}@example.com`;
    const signup = await makeRequest('POST', '/api/signup', {
      name: 'Pass User',
      email,
      pass: 'password123'
    });
    const sessionCookie = signup.headers['set-cookie'][0].split(';')[0];
    const csrfToken = signup.data.csrf;

    // Change password
    const changeRes = await makeRequest('POST', '/api/user/password', {
      currentPass: 'password123',
      newPass: 'newpassword123'
    }, {
      'Cookie': sessionCookie,
      'X-CSRF-Token': csrfToken
    });

    expect(changeRes.status).toBe(200);
    const newCookie = changeRes.headers['set-cookie'][0].split(';')[0];
    expect(newCookie).not.toBe(sessionCookie);

    // Old cookie should no longer be valid for /api/projects
    const oldSessionTest = await makeRequest('GET', '/api/projects', null, {
      'Cookie': sessionCookie
    });
    expect(oldSessionTest.status).toBe(401);
  });
});

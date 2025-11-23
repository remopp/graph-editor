//saves/reads the login token and auto-attaches Authorization.
// Wraps fetch to handle JSON and return data or error.

const LS_TOKEN = 'ge_token';
const LS_USER  = 'ge_username';


//saves the token and username to localStorage
export function apiSaveAuth(token, username) {
  if (token) localStorage.setItem(LS_TOKEN, token);
  if (username != null) localStorage.setItem(LS_USER, username);
}
// clears the token and username from localStorage
export function apiClearAuth() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER);
}
//gets the token and username from localStorage
export function apiGetToken()     { return localStorage.getItem(LS_TOKEN); }
export function apiGetUsername()  { return localStorage.getItem(LS_USER); }

export const apiGetAuthToken = apiGetToken;
export function apiSetAuthToken(token) { if (token) localStorage.setItem(LS_TOKEN, token); }
export function apiSetUsername(username) { if (username != null) localStorage.setItem(LS_USER, username); }

// this helper returns headers object with Authorization if auth is enabled and token exists
function authHeaders(enabled = true) {
  if (!enabled) return {};
  const t = apiGetToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// this fuinction sends a request to your server, automatically includes your login token (unless you turn it off), and handles JSON for you
export async function apiFetch(path, options = {}) {
  const { auth = true, ...rest } = options;

  let headers = rest.headers || {};
  const isForm = rest.body instanceof FormData;

  
  if (!isForm && rest.body && typeof rest.body !== 'string') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    rest.body = JSON.stringify(rest.body);
  }

  headers = { ...headers, ...authHeaders(auth) };
  return fetch(path, { ...rest, headers });
}
// this function is used to read JSON from a fetch Response, returns error 'Bad JSON' on failure
async function readJson(res) {
  try { return await res.json(); }
  catch { return { error: 'Bad JSON' }; }
}
// this function reads JSON and returns  error if the response was not ok
async function toJsonOrError(res) {
  const data = await readJson(res);
  if (!res.ok) {
    return { error: data?.error || res.statusText || `HTTP ${res.status}` };
  }
  return data;
}


//this function sends a GET, POST, PUT, or DELETE request to the server and returns the JSON response or  error  
export async function apiGet(path, options) {
  const res = await apiFetch(path, { method: 'GET', ...(options || {}) });
  return toJsonOrError(res);
}
export async function apiPost(path, body, options) {
  const res = await apiFetch(path, { method: 'POST', body, ...(options || {}) });
  return toJsonOrError(res);
}
export async function apiPut(path, body, options) {
  const res = await apiFetch(path, { method: 'PUT', body, ...(options || {}) });
  return toJsonOrError(res);
}
export async function apiDelete(path, options) {
  const res = await apiFetch(path, { method: 'DELETE', ...(options || {}) });
  return toJsonOrError(res);
}

//this function checks if the response has an auth error and if so, clears the token and redirects to login page
export function apiHandleAuthError(resp) {
  const msg = resp?.error || resp?.message;
  if (msg && /token|auth|unauth|forbidden|401|403/i.test(msg)) {
    alert('Please log in again.');
    apiClearAuth();
    location.href = './login.html';
  }
}

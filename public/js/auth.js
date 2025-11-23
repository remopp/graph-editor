//here the program handles the login and signup forms
import { apiPost, apiSaveAuth } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.getElementById('signupForm');
  const loginForm  = document.getElementById('loginForm');

  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('suUser').value.trim();
      const password = document.getElementById('suPass').value.trim();

      //unauthenticated call  
      const res = await apiPost('/auth/signup', { username, password }, { auth: false });
      if (res.error) return alert(res.error);

      // server should return  token and username 
      apiSaveAuth(res.token, res.username);
      location.href = './dashboard.html';
    });
  } 

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('liUser').value.trim();
      const password = document.getElementById('liPass').value.trim();

      const res = await apiPost('/auth/login', { username, password }, { auth: false });
      if (res.error) return alert(res.error);

      apiSaveAuth(res.token, res.username);
      location.href = './dashboard.html';
    });
  }
});

"use strict";

const AdminAuth = (() => {
  const ACCESS_STORAGE_KEY = "tu_tien_admin_access_token";
  const REFRESH_STORAGE_KEY = "tu_tien_admin_refresh_token";
  const ALLOWED_ROLES = new Set(["GM", "ADMIN"]);
  const dialog = document.getElementById("admin-auth-dialog");
  const form = document.getElementById("admin-auth-form");
  const usernameInput = document.getElementById("admin-username");
  const passwordInput = document.getElementById("admin-password");
  const errorBox = document.getElementById("admin-auth-error");
  const submitButton = document.getElementById("admin-auth-submit");
  const userLabel = document.getElementById("admin-user-label");
  const logoutButton = document.getElementById("admin-logout");
  const state = {
    accessToken: read(ACCESS_STORAGE_KEY),
    refreshToken: read(REFRESH_STORAGE_KEY),
    user: null,
    refreshPromise: null,
  };

  function read(key) {
    try { return window.sessionStorage.getItem(key) || ""; }
    catch { return ""; }
  }

  function write(key, value) {
    try {
      if (value) window.sessionStorage.setItem(key, value);
      else window.sessionStorage.removeItem(key);
    } catch { /* Keep the session in memory if browser storage is unavailable. */ }
  }

  function showDialog(message = "") {
    if (errorBox) {
      errorBox.textContent = message;
      errorBox.hidden = !message;
    }
    document.body.classList.add("admin-auth-required");
    if (dialog && !dialog.open) {
      try { dialog.showModal(); }
      catch { dialog.setAttribute("open", ""); }
    }
    if (!message) usernameInput?.focus();
  }

  function renderSession(user) {
    state.user = user;
    if (userLabel) userLabel.textContent = user ? `${user.username} · ${user.role}` : "Chưa đăng nhập";
    if (logoutButton) logoutButton.hidden = !user;
    document.body.classList.toggle("admin-auth-required", !user);
    if (user && dialog?.open) dialog.close();
  }

  function persistTokens() {
    write(ACCESS_STORAGE_KEY, state.accessToken);
    write(REFRESH_STORAGE_KEY, state.refreshToken);
  }

  function clearSession(message = "") {
    state.accessToken = "";
    state.refreshToken = "";
    state.user = null;
    write(ACCESS_STORAGE_KEY, "");
    write(REFRESH_STORAGE_KEY, "");
    renderSession(null);
    showDialog(message);
  }

  function jsonResponse(status, error) {
    return new Response(JSON.stringify({ error }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function adminEndpoint(url) {
    try {
      const target = new URL(url, window.location.href);
      const apiBase = new URL(API.BASE, window.location.href);
      return target.origin === apiBase.origin && target.pathname.startsWith("/api/admin/");
    } catch { return false; }
  }

  async function readResponse(response) {
    try { return await response.json(); }
    catch { return {}; }
  }

  async function getCurrentUser(token) {
    const response = await fetch(API.BASE + API.PATHS.auth.me, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { response, data: await readResponse(response) };
  }

  async function revoke(refreshToken) {
    if (!refreshToken) return;
    try {
      await fetch(API.BASE + API.PATHS.auth.logout, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch { /* Local logout must still complete when the API is offline. */ }
  }

  async function refreshSession() {
    if (state.refreshPromise) return state.refreshPromise;
    if (!state.refreshToken) {
      clearSession("Phiên Admin đã hết hạn. Hãy đăng nhập lại.");
      return false;
    }

    state.refreshPromise = (async () => {
      let response;
      try {
        response = await fetch(API.BASE + API.PATHS.auth.refresh, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: state.refreshToken }),
        });
      } catch {
        clearSession("Không kết nối được máy chủ xác thực. Hãy đăng nhập lại khi máy chủ sẵn sàng.");
        return false;
      }

      const data = await readResponse(response);
      const accessToken = data?.accessToken || data?.token;
      if (!response.ok || !accessToken || !data?.refreshToken) {
        clearSession("Phiên Admin đã hết hạn. Hãy đăng nhập lại.");
        return false;
      }

      state.accessToken = accessToken;
      state.refreshToken = data.refreshToken;
      persistTokens();
      try {
        const current = await getCurrentUser(accessToken);
        if (!current.response.ok || !ALLOWED_ROLES.has(String(current.data?.user?.role || "").toUpperCase())) {
          await revoke(state.refreshToken);
          clearSession("Tài khoản hiện không còn quyền GM/ADMIN.");
          return false;
        }
        renderSession(current.data.user);
        persistTokens();
        return true;
      } catch {
        clearSession("Không xác minh được quyền Admin. Hãy đăng nhập lại khi máy chủ sẵn sàng.");
        return false;
      }
    })();

    try { return await state.refreshPromise; }
    finally { state.refreshPromise = null; }
  }

  async function restoreSession() {
    if (!state.accessToken && !state.refreshToken) {
      showDialog();
      return false;
    }
    try {
      if (state.accessToken) {
        const current = await getCurrentUser(state.accessToken);
        if (current.response.ok) {
          const user = current.data?.user;
          if (ALLOWED_ROLES.has(String(user?.role || "").toUpperCase())) {
            renderSession(user);
            persistTokens();
            return true;
          }
          await revoke(state.refreshToken);
          clearSession("Tài khoản hiện không có quyền GM/ADMIN.");
          return false;
        }
        if (current.response.status !== 401) {
          showDialog(current.data?.error || "Không xác minh được phiên Admin.");
          return false;
        }
      }
      return await refreshSession();
    } catch {
      showDialog("Không kết nối được máy chủ xác thực.");
      return false;
    }
  }

  async function login(username, password) {
    const response = await fetch(API.BASE + API.PATHS.auth.login, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await readResponse(response);
    const accessToken = data?.accessToken || data?.token;
    if (!response.ok || !accessToken || !data?.refreshToken) {
      throw new Error(data?.error || "Đăng nhập không thành công.");
    }

    let current;
    try { current = await getCurrentUser(accessToken); }
    catch {
      await revoke(data.refreshToken);
      throw new Error("Không xác minh được tài khoản với máy chủ.");
    }
    const user = current.data?.user;
    if (!current.response.ok || !ALLOWED_ROLES.has(String(user?.role || "").toUpperCase())) {
      await revoke(data.refreshToken);
      throw new Error("Tài khoản này không có quyền GM/ADMIN.");
    }

    state.accessToken = accessToken;
    state.refreshToken = data.refreshToken;
    renderSession(user);
    persistTokens();
    passwordInput.value = "";
    window.dispatchEvent(new CustomEvent("admin:authenticated", { detail: { user } }));
    return user;
  }

  async function logout() {
    const refreshToken = state.refreshToken;
    clearSession();
    window.dispatchEvent(new CustomEvent("admin:unauthenticated"));
    await revoke(refreshToken);
  }

  async function fetchAdmin(url, options = {}) {
    await ready;
    if (!adminEndpoint(url)) return jsonResponse(400, "AdminAuth chỉ dùng cho API /api/admin/.");
    if (!state.accessToken || !state.user || !ALLOWED_ROLES.has(String(state.user.role || "").toUpperCase())) {
      return jsonResponse(401, "Cần đăng nhập bằng tài khoản GM/ADMIN.");
    }

    const method = String(options.method || "GET").toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      try {
        await API.assertPersistentStorage();
      } catch (error) {
        return jsonResponse(503, error?.message || "MySQL chưa sẵn sàng; thao tác ghi đã bị chặn.");
      }
    }

    const send = (token) => {
      const headers = new Headers(options.headers || {});
      headers.set("Authorization", `Bearer ${token}`);
      return fetch(url, { ...options, headers });
    };
    let response = await send(state.accessToken);
    if (response.status !== 401) return response;
    if (!(await refreshSession())) return response;
    response = await send(state.accessToken);
    if (response.status === 401) clearSession("Phiên Admin không còn hợp lệ. Hãy đăng nhập lại.");
    return response;
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!usernameInput.value.trim() || !passwordInput.value || !submitButton || submitButton.disabled) return;
    submitButton.disabled = true;
    submitButton.textContent = "Đang xác minh…";
    try {
      await login(usernameInput.value.trim(), passwordInput.value);
    } catch (error) {
      showDialog(error?.message || "Đăng nhập không thành công.");
      passwordInput.select();
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Đăng nhập";
    }
  });
  logoutButton?.addEventListener("click", () => { void logout(); });

  const ready = restoreSession();
  return Object.freeze({
    ready,
    login,
    logout,
    fetch: fetchAdmin,
    isAdminUrl: adminEndpoint,
    isAuthenticated: () => Boolean(state.accessToken && state.user),
    getUser: () => state.user ? { ...state.user } : null,
  });
})();

window.AdminAuth = AdminAuth;

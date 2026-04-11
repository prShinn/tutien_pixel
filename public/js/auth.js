
_mode = "login";
function _err(msg) {
  const el = document.getElementById("auth-err");
  el.textContent = msg;
  el.classList.add("show");
}
function _clearErr() {
  document.getElementById("auth-err").classList.remove("show");
}
async function submit() {
  const username = document.getElementById("inp-user").value.trim();
  const password = document.getElementById("inp-pass").value;
  _clearErr();
  if (!username || !password) return _err("Vui lòng điền đầy đủ thông tin");

  const btn = document.getElementById("auth-btn");
  btn.disabled = true;
  btn.textContent = "Đang xử lý...";
  try {
    const path = _mode === "login" ? "/auth/login" : "/auth/register";
    const res = await fetch(API.BASE + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", // Sửa lại thành Object
        Accept: "application/json", // Thêm Accept để nhận về JSON chuẩn
      },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      _err(data.error || "Lỗi không xác định");
      return;
    }

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem("tu_tien_token", authToken);
    if (authToken && currentUser.username) _afterLogin();
  } catch {
    _err("Không thể kết nối máy chủ. Thử chơi offline?");
  } finally {
    btn.disabled = false;
    btn.textContent = _mode === "login" ? "ĐĂNG NHẬP" : "ĐĂNG KÝ";
  }
}

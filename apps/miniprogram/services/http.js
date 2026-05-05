const TOKEN_KEY = "TODO_FAIRY_TOKEN";
const TRACE_ID_HEADER = "x-trace-id";

function buildTraceId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function toQueryString(query) {
  const pairs = Object.keys(query || {})
    .filter((key) => query[key] !== undefined && query[key] !== null && query[key] !== "")
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`);
  return pairs.length ? `?${pairs.join("&")}` : "";
}

function getBaseUrl() {
  const app = getApp();
  const baseUrl = (app && app.globalData && app.globalData.apiBaseUrl) || "";
  if (!baseUrl) {
    throw new Error("未配置后端地址");
  }
  return String(baseUrl).replace(/\/+$/, "");
}

function getRequestLogMeta({ path, method, _retried }) {
  return {
    path: String(path || ""),
    method: String(method || "GET").toUpperCase(),
    retried: Boolean(_retried),
  };
}

function logRequestStart(meta) {
  console.info("[http] request:start", meta);
}

function logRequestSuccess(meta, startedAt) {
  const payload = {
    ...meta,
    durationMs: Date.now() - startedAt,
  };
  if (meta.path === "/api/v1/calendar/month" || meta.path === "/api/v1/todos") {
    payload.data = meta.data;
  }
  console.info("[http] request:success", payload);
}

function logRequestFailure(meta, startedAt, error) {
  console.error("[http] request:fail", {
    ...meta,
    durationMs: Date.now() - startedAt,
    error: error && error.message ? error.message : String(error || ""),
  });
}

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || "";
}

function setToken(token) {
  wx.setStorageSync(TOKEN_KEY, token);
}

function clearToken() {
  wx.removeStorageSync(TOKEN_KEY);
}

// 登录锁：防止并发请求同时触发多次登录
let _loginPromise = null;

function refreshLogin() {
  if (_loginPromise) {
    return _loginPromise;
  }
  _loginPromise = new Promise((resolve, reject) => {
    const app = getApp();
    wx.login({
      success(loginResp) {
        if (!loginResp.code) {
          reject(new Error("微信登录失败"));
          return;
        }

        wx.request({
          url: `${getBaseUrl()}/api/v1/auth/wechat-login`,
          method: "POST",
          header: {
            "content-type": "application/json",
            [TRACE_ID_HEADER]: buildTraceId(),
          },
          data: {
            code: loginResp.code,
            devOpenId: (app && app.globalData && app.globalData.devOpenId) || "",
          },
          success(resp) {
            const result = resp.data || {};
            if (result.code === 0 && result.data && result.data.token) {
              setToken(result.data.token);
              getApp().globalData.token = result.data.token;
              resolve(result.data.token);
              return;
            }
            reject(new Error(result.message || "自动登录失败"));
          },
          fail(error) {
            reject(new Error((error && error.errMsg) || "自动登录失败"));
          },
        });
      },
      fail(error) {
        reject(new Error((error && error.errMsg) || "微信登录失败"));
      },
    });
  }).finally(() => {
    _loginPromise = null;
  });
  return _loginPromise;
}

function request({ path, method = "GET", query = {}, body = {}, withAuth = true, headers = {}, _retried = false }) {
  const app = getApp();
  const finalHeaders = { ...headers };
  const token = getToken();
  const requestMeta = getRequestLogMeta({ path, method, _retried });
  const startedAt = Date.now();
  const traceId = buildTraceId();
  if (withAuth && token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }
  finalHeaders[TRACE_ID_HEADER] = traceId;
  logRequestStart(requestMeta);

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getBaseUrl()}${path}${toQueryString(query)}`,
      method,
      header: {
        "content-type": "application/json",
        ...finalHeaders,
      },
      data: body,
      success(resp) {
        const result = resp.data || {};
        if (result.code === 0) {
          logRequestSuccess(
            {
              ...requestMeta,
              data: result.data,
            },
            startedAt
          );
          resolve(result.data);
          return;
        }
        if (result.code === 40101 && withAuth && !_retried) {
          console.warn("[http] request:retry-login", requestMeta);
          clearToken();
          app.globalData.token = "";
          refreshLogin()
            .then(() => request({ path, method, query, body, withAuth, headers, _retried: true }))
            .then(resolve)
            .catch(reject);
          return;
        }
        if (result.code === 40101) {
          clearToken();
          app.globalData.token = "";
        }
        reject(new Error(result.message || "请求失败"));
      },
      fail(error) {
        reject(new Error((error && error.errMsg) || "网络请求失败"));
      },
    });
  }).catch((error) => {
    logRequestFailure(requestMeta, startedAt, error);
    throw error;
  });
}

module.exports = {
  TOKEN_KEY,
  getToken,
  setToken,
  clearToken,
  refreshLogin,
  request,
};

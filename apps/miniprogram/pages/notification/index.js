const api = require("../../services/api");
const { getToken, setToken } = require("../../services/http");

const TEXT_NOT_TESTED = "尚未测试发送";
const TEXT_TEST_SUCCESS = "发送成功";
const TEXT_TEST_FAILED = "发送失败";

function pad2(num) {
  return String(num).padStart(2, "0");
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return "";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatLastTestText(data = {}) {
  const lastTestAt = Number(data.lastTestAt) || 0;
  if (!lastTestAt) {
    return TEXT_NOT_TESTED;
  }
  const timeText = formatDateTime(lastTestAt);
  if (!timeText) {
    return TEXT_NOT_TESTED;
  }
  const status = data.lastTestStatus === "failed" ? TEXT_TEST_FAILED : TEXT_TEST_SUCCESS;
  return `最近测试：${timeText} ${status}`;
}

Page({
  data: {
    loading: false,
    saving: false,
    testingDaily: false,
    testingWeekly: false,
    errorText: "",
    statusBarHeight: 0,
    navBarHeight: 44,
    form: {
      dailyEnabled: false,
      weeklyEnabled: false,
      sendKey: "",
    },
    hasSendKey: false,
    sendKeyMasked: "",
    dailySummaryTime: "22:00",
    weeklySummaryTime: "09:00",
    lastTestText: TEXT_NOT_TESTED,
    lastTestStatus: "",
    lastTestErrorMessage: "",
  },

  async onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = sysInfo.statusBarHeight;
    const navBarHeight = (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({
      statusBarHeight,
      navBarHeight,
    });
    await this.bootstrap();
  },

  showPageToast(options = {}) {
    const app = getApp();
    if (app && app.uiToast && typeof app.uiToast.show === "function") {
      const shown = app.uiToast.show(this, options);
      if (shown) {
        return;
      }
    }
    wx.showToast({
      title: options.text || "",
      icon: "none",
    });
  },

  onBack() {
    wx.navigateBack({
      fail: () => {
        wx.reLaunch({
          url: "/pages/menu/index",
        });
      },
    });
  },

  async bootstrap() {
    this.setData({ loading: true, errorText: "" });
    try {
      await this.ensureLogin();
      await this.loadSettings();
    } catch (err) {
      this.setData({
        errorText: err.message || "加载失败，请重试",
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  async ensureLogin() {
    if (getToken()) {
      return;
    }
    const loginData = await api.login();
    setToken(loginData.token);
    getApp().globalData.token = loginData.token;
  },

  async loadSettings() {
    const data = await api.getNotificationSettings();
    this.setData({
      "form.dailyEnabled": Boolean(data.dailyEnabled !== undefined ? data.dailyEnabled : data.enabled),
      "form.weeklyEnabled": Boolean(data.weeklyEnabled),
      "form.sendKey": "",
      hasSendKey: Boolean(data.hasSendKey),
      sendKeyMasked: data.sendKeyMasked || "",
      dailySummaryTime: data.dailySummaryTime || "22:00",
      weeklySummaryTime: data.weeklySummaryTime || "09:00",
      lastTestText: formatLastTestText(data),
      lastTestStatus: data.lastTestStatus || "",
      lastTestErrorMessage: data.lastTestErrorMessage || "",
    });
  },

  onToggleDailyEnabled(e) {
    this.setData({
      "form.dailyEnabled": Boolean(e.detail.value),
    });
  },

  onToggleWeeklyEnabled(e) {
    this.setData({
      "form.weeklyEnabled": Boolean(e.detail.value),
    });
  },

  onSendKeyInput(e) {
    this.setData({
      "form.sendKey": e.detail.value || "",
    });
  },

  buildSavePayload() {
    const payload = {
      dailyEnabled: Boolean(this.data.form.dailyEnabled),
      weeklyEnabled: Boolean(this.data.form.weeklyEnabled),
    };
    const sendKey = String(this.data.form.sendKey || "").trim();
    if (sendKey) {
      payload.sendKey = sendKey;
    }
    return payload;
  },

  async saveSettings(showSuccessToast = true) {
    if (this.data.saving) {
      return null;
    }
    this.setData({ saving: true });
    try {
      const latest = await api.updateNotificationSettings(this.buildSavePayload());
      this.setData({
        "form.dailyEnabled": Boolean(latest.dailyEnabled !== undefined ? latest.dailyEnabled : latest.enabled),
        "form.weeklyEnabled": Boolean(latest.weeklyEnabled),
        "form.sendKey": "",
        hasSendKey: Boolean(latest.hasSendKey),
        sendKeyMasked: latest.sendKeyMasked || "",
        dailySummaryTime: latest.dailySummaryTime || "22:00",
        weeklySummaryTime: latest.weeklySummaryTime || "09:00",
        lastTestText: formatLastTestText(latest),
        lastTestStatus: latest.lastTestStatus || "",
        lastTestErrorMessage: latest.lastTestErrorMessage || "",
      });
      if (showSuccessToast) {
        this.showPageToast({
          text: "保存成功",
          type: "success",
          key: "notification_settings_save_success",
        });
      }
      return latest;
    } catch (err) {
      this.showPageToast({
        text: err.message || "保存失败",
        type: "error",
        key: `notification_settings_save_error:${err.message || "save_failed"}`,
      });
      throw err;
    } finally {
      this.setData({ saving: false });
    }
  },

  async onSaveSettings() {
    await this.saveSettings(true);
  },

  async onTestDailySend() {
    if (this.data.testingDaily) {
      return;
    }
    this.setData({ testingDaily: true });
    try {
      await this.saveSettings(false);
      const data = await api.testNotificationSend();
      const sentAt = Number(data && data.sentAt) || Date.now();
      this.setData({
        lastTestStatus: "success",
        lastTestErrorMessage: "",
        lastTestText: `最近测试：${formatDateTime(sentAt)} ${TEXT_TEST_SUCCESS}`,
      });
      this.showPageToast({
        text: "测试日报发送成功",
        type: "success",
        key: "notification_daily_test_send_success",
      });
    } catch (err) {
      this.setData({
        lastTestStatus: "failed",
        lastTestErrorMessage: err.message || "测试日报发送失败",
        lastTestText: `最近测试：${formatDateTime(Date.now())} ${TEXT_TEST_FAILED}`,
      });
      this.showPageToast({
        text: err.message || "测试日报发送失败",
        type: "error",
        key: `notification_daily_test_send_error:${err.message || "daily_failed"}`,
      });
    } finally {
      this.setData({ testingDaily: false });
    }
  },

  async onTestWeeklySend() {
    if (this.data.testingWeekly) {
      return;
    }
    this.setData({ testingWeekly: true });
    try {
      await this.saveSettings(false);
      const data = await api.testWeeklyNotificationSend();
      const sentAt = Number(data && data.sentAt) || Date.now();
      this.setData({
        lastTestStatus: "success",
        lastTestErrorMessage: "",
        lastTestText: `最近测试：${formatDateTime(sentAt)} ${TEXT_TEST_SUCCESS}`,
      });
      this.showPageToast({
        text: "测试周报发送成功",
        type: "success",
        key: "notification_weekly_test_send_success",
      });
    } catch (err) {
      this.setData({
        lastTestStatus: "failed",
        lastTestErrorMessage: err.message || "测试周报发送失败",
        lastTestText: `最近测试：${formatDateTime(Date.now())} ${TEXT_TEST_FAILED}`,
      });
      this.showPageToast({
        text: err.message || "测试周报发送失败",
        type: "error",
        key: `notification_weekly_test_send_error:${err.message || "weekly_failed"}`,
      });
    } finally {
      this.setData({ testingWeekly: false });
    }
  },
});
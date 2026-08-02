Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 44,
  },

  onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = sysInfo.statusBarHeight;
    const navBarHeight = (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({
      statusBarHeight,
      navBarHeight,
    });
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
          url: "/pages/index/index",
        });
      },
    });
  },

  onGoHome() {
    this.onBack();
  },

  onOpenTagManage() {
    wx.navigateTo({
      url: "/pages/tag/index",
      fail: () => {
        this.showPageToast({
          text: "标签管理打开失败",
          type: "error",
          key: "menu_tag_manage_open_error",
        });
      },
    });
  },


  onOpenNotificationSettings() {
    wx.navigateTo({
      url: "/pages/notification/index",
      fail: () => {
        this.showPageToast({
          text: "提醒设置打开失败",
          type: "error",
          key: "menu_notification_open_error",
        });
      },
    });
  },

  onOpenStats() {
    wx.navigateTo({
      url: "/pages/stats/index",
      fail: () => {
        this.showPageToast({
          text: "统计报表打开失败",
          type: "error",
          key: "menu_stats_open_error",
        });
      },
    });
  },
});

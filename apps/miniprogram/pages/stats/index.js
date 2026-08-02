const api = require("../../services/api");

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 44,
    loading: true,
    errorText: "",
    overview: null,
    streak: null,
    trendDays: [],
    trendStartLabel: "",
    trendEndLabel: "",
  },

  onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = sysInfo.statusBarHeight;
    const navBarHeight = (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    this.setData({ statusBarHeight, navBarHeight });
    this.loadData();
  },

  onShow() {
    if (!this.data.loading && !this.data.overview) {
      this.loadData();
    }
  },

  loadData() {
    this.setData({ loading: true, errorText: "" });
    Promise.all([api.getStatsOverview(), api.getStatsTrend(), api.getStatsStreak()])
      .then(([overviewRes, trendRes, streakRes]) => {
        const trendDays = (trendRes.days || []).map((item) => ({
          ...item,
          barHeight: item.total === 0 ? 4 : Math.max(8, item.completionRate),
          isEmpty: item.total === 0,
          isFull: item.total > 0 && item.completionRate === 100,
        }));
        const days = trendRes.days || [];
        this.setData({
          loading: false,
          overview: overviewRes,
          streak: streakRes,
          trendDays,
          trendStartLabel: days.length > 0 ? days[0].date.slice(5) : "",
          trendEndLabel: days.length > 0 ? days[days.length - 1].date.slice(5) : "",
        });
      })
      .catch(() => {
        this.setData({ loading: false, errorText: "数据加载失败，请下拉刷新重试" });
      });
  },

  onPullDownRefresh() {
    this.loadData();
    wx.stopPullDownRefresh();
  },

  onBack() {
    wx.navigateBack({
      fail: () => {
        wx.reLaunch({ url: "/pages/index/index" });
      },
    });
  },
});

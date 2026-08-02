const { getTodayDate, monthOfDate, shiftMonth, listMonthGrid } = require("../../utils/date");

Component({
  properties: {
    show: { type: Boolean, value: false },
    value: { type: String, value: "" },
  },
  data: {
    today: "",
    currentMonth: "",
    calendarCells: [],
    internalValue: "",
    panelAnimation: null,
  },
  observers: {
    show(val) {
      if (!val) return;
      const today = getTodayDate();
      const internalValue = this.data.value || today;
      const currentMonth = monthOfDate(internalValue);
      const calendarCells = listMonthGrid(currentMonth, internalValue, today);
      const initAnim = wx.createAnimation({ duration: 0, timingFunction: "linear" });
      initAnim.translateY("100%").step();
      this.setData({ today, currentMonth, calendarCells, internalValue, panelAnimation: initAnim.export() });
      wx.nextTick(() => {
        const openAnim = wx.createAnimation({ duration: 280, timingFunction: "ease-out" });
        openAnim.translateY("0").step();
        this.setData({ panelAnimation: openAnim.export() });
      });
    },
  },
  methods: {
    noop() {},
    onMaskTap() {
      this.triggerEvent("close");
    },
    onPanelTap() {},
    onPrevMonth() {
      const currentMonth = shiftMonth(this.data.currentMonth, -1);
      const calendarCells = listMonthGrid(currentMonth, this.data.internalValue, this.data.today);
      this.setData({ currentMonth, calendarCells });
    },
    onNextMonth() {
      const currentMonth = shiftMonth(this.data.currentMonth, 1);
      const calendarCells = listMonthGrid(currentMonth, this.data.internalValue, this.data.today);
      this.setData({ currentMonth, calendarCells });
    },
    onSelectDay(e) {
      const date = e.currentTarget.dataset.date;
      if (!date) return;
      this.triggerEvent("change", { date });
      this.triggerEvent("close");
    },
  },
});

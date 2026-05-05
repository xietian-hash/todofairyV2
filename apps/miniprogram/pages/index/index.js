const api = require("../../services/api");
const { getToken, setToken } = require("../../services/http");
const { getTodayDate, monthOfDate, shiftMonth, listMonthGrid } = require("../../utils/date");
const { getTagColor, getAllTagColors } = require("../../utils/tag-colors");

const TASK_MODAL_ANIM_DURATION = 160;
const TASK_MODAL_CLOSE_DELAY = TASK_MODAL_ANIM_DURATION + 20;
const TODO_SWIPE_DELETE_WIDTH_RPX = 156;
const TASK_SWIPE_ACTION_WIDTH_RPX = 312;
const SWIPE_DIRECTION_LOCK_DISTANCE_PX = 8;
const SWIPE_OPEN_THRESHOLD_RATIO = 0.4;
const SWIPE_RIGHT_PULL_PX = 12;
const VIEW_SWITCH_THRESHOLD_PX = 28;
const REPEAT_WEEKDAY_OPTIONS = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 7, label: "周日" },
];
const REPEAT_WEEKDAY_LABEL_MAP = REPEAT_WEEKDAY_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});
const REPEAT_WEEKDAY_FULL_COUNT = REPEAT_WEEKDAY_OPTIONS.length;
const REPEAT_WEEKDAY_RANGE_MIN_COUNT = 3;

function normalizeRepeatWeekdays(weekdays = []) {
  return [...new Set((weekdays || []).map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 1 && item <= 7))].sort(
    (a, b) => a - b
  );
}

function buildRepeatWeekdayOptions(selectedWeekdays = []) {
  const selectedSet = new Set(normalizeRepeatWeekdays(selectedWeekdays));
  return REPEAT_WEEKDAY_OPTIONS.map((item) => ({
    ...item,
    selected: selectedSet.has(item.value),
  }));
}

const SUB_TASK_MIN_COUNT = 1;
const SUB_TASK_MAX_COUNT = 20;
const SUB_TASK_TITLE_MAX_LEN = 64;
const SUB_TASK_AI_TIMEOUT_MS = 30000;
const SUB_TASK_AI_LOADING_TEXT = "AI\u601d\u8003\u4e2d";
const SUB_TASK_AI_EMPTY_TEXT = "AI\u6ca1\u6709\u5efa\u8bae\u5462";
const DATE_WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function formatDateWithWeekday(dateStr) {
  const date = String(dateStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${date} ${DATE_WEEKDAY_LABELS[weekday]}`;
}

function defaultSubTaskItem() {
  return {
    title: "",
  };
}

function normalizeSubTaskItems(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => {
      const rawTitle = typeof item === "string" ? item : item && item.title;
      return {
        title: String(rawTitle || "").trim(),
      };
    })
    .filter((item) => item.title)
    .slice(0, SUB_TASK_MAX_COUNT);
}

function ensureTaskSubTaskItems(items = []) {
  const normalized = normalizeSubTaskItems(items);
  if (normalized.length > 0) {
    return normalized;
  }
  return [defaultSubTaskItem()];
}

function defaultTaskForm(today) {
  return {
    title: "",
    remark: "",
    tagId: "",
    tagName: "",
    subTaskEnabled: false,
    subTasks: [defaultSubTaskItem()],
    effectiveStartDate: today,
    effectiveStartDateDisplay: formatDateWithWeekday(today),
    effectiveEndDate: "",
    effectiveEndDateDisplay: "",
    repeatWeekdays: [],
  };
}

function defaultTodoForm() {
  return {
    title: "",
    remark: "",
    tagId: "",
    tagName: "",
    todoDate: "",
    todoDateDisplay: "",
  };
}

function defaultTaskStats() {
  const empty = {
    totalTodos: 0,
    completedTodos: 0,
    uncompletedTodos: 0,
    completionRate: 0,
  };
  return {
    taskId: "",
    title: "",
    all: { ...empty },
    month: { ...empty },
    week: { ...empty },
  };
}

function normalizeTagOptions(list = []) {
  return (list || [])
    .filter((item) => item && item.tagId && item.tagName)
    .map((item) => {
      const color = Number.isInteger(item.color) ? item.color : 0;
      const tagColor = getTagColor(color);
      return {
        tagId: String(item.tagId),
        tagName: String(item.tagName),
        color: color,
        colorBg: tagColor.bg,
        colorText: tagColor.text,
        sort: Number(item.sort) || 0,
      };
    });
}

function findTagIndex(options, tagId) {
  if (!tagId) {
    return -1;
  }
  return options.findIndex((item) => item.tagId === tagId);
}

function getTagColorInfo(tagOptions, tagId) {
  if (!tagId) {
    return null;
  }
  const tag = tagOptions.find((item) => item.tagId === tagId);
  if (tag && tag.colorBg && tag.colorText) {
    return {
      bg: tag.colorBg,
      text: tag.colorText,
    };
  }
  // 默认蓝色
  return {
    bg: "#E0F5FF",
    text: "#0369A1",
  };
}

function formatTaskDateRange(task) {
  const start = task.effectiveStartDate || "";
  const end = task.effectiveEndDate || "";
  if (!end) {
    return "长期有效";
  }
  if (!start) {
    return end;
  }
  return `${start} ~ ${end}`;
}

function formatTaskRepeatText(task) {
  const weekdays = normalizeRepeatWeekdays(task && task.repeatRule && task.repeatRule.weekdays);
  if (!weekdays.length) {
    return "";
  }
  if (weekdays.length === REPEAT_WEEKDAY_FULL_COUNT) {
    return "重复：每日";
  }

  const parts = [];
  let segmentStart = weekdays[0];
  let segmentEnd = weekdays[0];

  for (let index = 1; index < weekdays.length; index += 1) {
    const current = weekdays[index];
    if (current === segmentEnd + 1) {
      segmentEnd = current;
      continue;
    }
    appendWeekdaySegmentText(parts, segmentStart, segmentEnd);
    segmentStart = current;
    segmentEnd = current;
  }
  appendWeekdaySegmentText(parts, segmentStart, segmentEnd);

  if (!parts.length) {
    return "";
  }
  return `重复：${parts.join("、")}`;
}

function appendWeekdaySegmentText(parts, start, end) {
  const startLabel = REPEAT_WEEKDAY_LABEL_MAP[start];
  const endLabel = REPEAT_WEEKDAY_LABEL_MAP[end];
  if (!startLabel || !endLabel) {
    return;
  }

  const count = end - start + 1;
  if (count >= REPEAT_WEEKDAY_RANGE_MIN_COUNT) {
    parts.push(`${startLabel}~${endLabel}`);
    return;
  }

  if (count === 2) {
    parts.push(startLabel, endLabel);
    return;
  }

  parts.push(startLabel);
}

function normalizeTaskList(list = [], tagOptions = []) {
  return (list || []).map((item) => {
    const tagColor = item.tagId ? getTagColorInfo(tagOptions, item.tagId) : null;
    const hasConfiguredSubTasks = normalizeSubTaskItems(item && item.subTasks).length > 0;
    return {
      ...item,
      isParentTask: hasConfiguredSubTasks,
      dateRangeText: formatTaskDateRange(item),
      repeatText: formatTaskRepeatText(item),
      tagColorBg: tagColor ? tagColor.bg : "",
      tagColorText: tagColor ? tagColor.text : "",
    };
  });
}

function normalizeParentCollapseMap(todoList = [], previousMap = {}) {
  const parentIds = new Set();
  (todoList || []).forEach((item) => {
    if (!item || !item.isSubTodo || !item.parentTodoId) {
      return;
    }
    parentIds.add(String(item.parentTodoId));
  });

  const nextMap = {};
  parentIds.forEach((parentId) => {
    if (Object.prototype.hasOwnProperty.call(previousMap, parentId)) {
      nextMap[parentId] = Boolean(previousMap[parentId]);
      return;
    }
    // 新出现的父待办默认折叠
    nextMap[parentId] = true;
  });
  return nextMap;
}

function buildTodoDisplayList(todoList = [], collapseMap = {}) {
  const parentIds = new Set();
  (todoList || []).forEach((item) => {
    if (!item || !item.isSubTodo || !item.parentTodoId) {
      return;
    }
    parentIds.add(String(item.parentTodoId));
  });

  return (todoList || [])
    .map((item) => {
      const todoId = item && item._id ? String(item._id) : "";
      const parentTodoId = item && item.parentTodoId ? String(item.parentTodoId) : "";
      const isSubTodo = Boolean(item && item.isSubTodo);
      const hasSubTodos = Boolean(!isSubTodo && todoId && parentIds.has(todoId));
      const subTodosCollapsed = hasSubTodos ? Boolean(collapseMap[todoId]) : false;
      const hiddenByParentCollapse = Boolean(isSubTodo && parentTodoId && collapseMap[parentTodoId]);

      return {
        ...item,
        _id: todoId,
        parentTodoId,
        isSubTodo,
        hasSubTodos,
        subTodosCollapsed,
        hiddenByParentCollapse,
      };
    })
    .filter((item) => !item.hiddenByParentCollapse);
}

function decorateTodoListWithTagColors(todoList = [], tagOptions = []) {
  return (todoList || []).map((item) => {
    const tagColor = item && item.tagId ? getTagColorInfo(tagOptions, item.tagId) : null;
    return {
      ...item,
      _id: item && item._id ? String(item._id) : "",
      isSubTodo: Boolean(item && item.isSubTodo),
      parentTodoId: item && item.parentTodoId ? String(item.parentTodoId) : "",
      tagColorBg: tagColor ? tagColor.bg : "",
      tagColorText: tagColor ? tagColor.text : "",
    };
  });
}

function summarizeTodoProgress(todoList = []) {
  return (todoList || []).reduce(
    (summary, item) => {
      if (!item || item.isSubTodo) {
        return summary;
      }
      if (Number(item.status) === 2) {
        summary.completedCount += 1;
      } else {
        summary.uncompletedCount += 1;
      }
      return summary;
    },
    {
      completedCount: 0,
      uncompletedCount: 0,
    }
  );
}

function resolveLocalCalendarStatus(date, today, completedCount, uncompletedCount) {
  const total = completedCount + uncompletedCount;
  if (total > 0 && completedCount === total) {
    return "completed";
  }
  if (date === today && uncompletedCount > 0) {
    return "today_uncompleted";
  }
  if (date > today && uncompletedCount > 0) {
    return "future_uncompleted";
  }
  if (uncompletedCount > 0) {
    return "history_uncompleted";
  }
  return "no_todo";
}

function buildTodoViewState(todoList = [], collapseMap = {}, selectedDate = "", today = "") {
  const nextCollapseMap = normalizeParentCollapseMap(todoList, collapseMap);
  const displayTodos = buildTodoDisplayList(todoList, nextCollapseMap);
  const summary = summarizeTodoProgress(todoList);
  const total = summary.completedCount + summary.uncompletedCount;

  return {
    todoSourceList: todoList,
    collapsedParentTodoMap: nextCollapseMap,
    todos: displayTodos,
    completedCount: summary.completedCount,
    uncompletedCount: summary.uncompletedCount,
    total,
    progressPercent: total > 0 ? Math.round((summary.completedCount / total) * 100) : 0,
    selectedDayStatus: resolveLocalCalendarStatus(selectedDate, today, summary.completedCount, summary.uncompletedCount),
  };
}

function applyTodoStatusSnapshot(todo = {}, nextStatus, now, today) {
  if (nextStatus === 2) {
    return {
      ...todo,
      status: 2,
      completedAt: now,
      isExpired: false,
      updatedAt: now,
    };
  }

  const shouldExpired = Boolean(todo.todoDate && today && todo.todoDate < today);
  return {
    ...todo,
    status: 1,
    completedAt: null,
    isExpired: shouldExpired,
    expiredAt: shouldExpired ? todo.expiredAt || now : todo.expiredAt,
    updatedAt: now,
  };
}

function applyOptimisticTodoStatus(todoList = [], todoId, nextStatus, today) {
  const normalizedTodoId = String(todoId || "");
  if (!normalizedTodoId) {
    return null;
  }

  const sourceList = Array.isArray(todoList) ? todoList : [];
  const targetIndex = sourceList.findIndex((item) => item && item._id === normalizedTodoId);
  if (targetIndex < 0) {
    return null;
  }

  const targetTodo = sourceList[targetIndex];
  const targetSubTodos = sourceList.filter((item) => item && item.isSubTodo && item.parentTodoId === normalizedTodoId);
  if (!targetTodo.isSubTodo && nextStatus === 2 && targetSubTodos.some((item) => Number(item.status) === 1)) {
    return {
      blockedMessage: "请先完成子待办",
    };
  }

  const now = Date.now();
  const nextList = sourceList.map((item) => ({ ...item }));
  nextList[targetIndex] = applyTodoStatusSnapshot(nextList[targetIndex], nextStatus, now, today);

  if (targetTodo.isSubTodo && targetTodo.parentTodoId) {
    const parentTodoId = String(targetTodo.parentTodoId);
    const parentIndex = nextList.findIndex((item) => item && item._id === parentTodoId);
    if (parentIndex >= 0) {
      const siblingTodos = nextList.filter((item) => item && item.isSubTodo && item.parentTodoId === parentTodoId);
      const allCompleted = siblingTodos.length > 0 && siblingTodos.every((item) => Number(item.status) === 2);
      const parentNextStatus = allCompleted ? 2 : 1;
      if (Number(nextList[parentIndex].status) !== parentNextStatus) {
        nextList[parentIndex] = applyTodoStatusSnapshot(nextList[parentIndex], parentNextStatus, now, today);
      }
    }
  }

  return {
    nextList,
  };
}

Page({
  data: {
    ready: false,
    loading: false,
    errorText: "",
    today: "",
    currentMonth: "",
    selectedDate: "",
    calendarCells: [],
    dayStatusMap: {},
    currentView: "todo",
    todos: [],
    todoSourceList: [],
    collapsedParentTodoMap: {},
    tasks: [],
    taskListLoading: false,
    taskListLoaded: false,
    completedCount: 0,
    uncompletedCount: 0,
    total: 0,
    progressPercent: 0,
    taskModalVisible: false,
    taskModalMode: "create",
    editingTaskId: "",
    taskForm: {},
    taskModalSaving: false,
    taskModalClosing: false,
    taskModalAnimation: null,
    taskTitleFocus: false,
    taskQuickTagVisible: false,
    taskQuickTagName: "",
    taskQuickTagSaving: false,
    taskQuickTagFocus: false,
    taskSubTaskAiLoading: false,
    taskStatsModalVisible: false,
    taskStatsLoading: false,
    taskStatsError: "",
    taskStats: defaultTaskStats(),
    todoModalVisible: false,
    todoModalSaving: false,
    todoModalClosing: false,
    todoModalAnimation: null,
    editingTodoId: "",
    todoForm: {},
    todoTitleFocus: false,
    modalKeyboardHeight: 0,
    modalScrollIntoView: "",
    tagOptions: [],
    tagLoading: false,
    taskTagIndex: -1,
    todoTagIndex: -1,
    repeatWeekdayOptions: buildRepeatWeekdayOptions([]),
    statusBarHeight: 0,
    navBarHeight: 44,
    todoSwipeDeleteWidthPx: 0,
    taskSwipeActionWidthPx: 0,
    openedTodoId: "",
    movingTodoId: "",
    movingOffset: 0,
    openedTaskId: "",
    movingTaskId: "",
    movingTaskOffset: 0,
    todayCompensatedDate: "",
  },

  async onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = sysInfo.statusBarHeight;
    const navBarHeight = (menuBtn.top - statusBarHeight) * 2 + menuBtn.height;
    const todoSwipeDeleteWidthPx = Math.round((TODO_SWIPE_DELETE_WIDTH_RPX / 750) * sysInfo.windowWidth);
    const taskSwipeActionWidthPx = Math.round((TASK_SWIPE_ACTION_WIDTH_RPX / 750) * sysInfo.windowWidth);
    const today = getTodayDate();
    const currentMonth = monthOfDate(today);
    const initialCalendarCells = listMonthGrid(currentMonth, today, today, {});
    this.setData({
      statusBarHeight,
      navBarHeight,
      todoSwipeDeleteWidthPx,
      taskSwipeActionWidthPx,
      today,
      selectedDate: today,
      currentMonth,
      calendarCells: initialCalendarCells,
      taskForm: defaultTaskForm(today),
      todoForm: defaultTodoForm(),
    });
    await this.bootstrap();
  },

  async onShow() {
    // 从其他页面返回时，重新加载标签选项和列表（以防标签被修改）
    if (this.data.ready) {
      const reloaders = [this.loadTagOptions(true)];
      if (this.data.currentView === "task") {
        reloaders.push(this.loadTasks(true));
      } else {
        reloaders.push(this.loadTodos());
        reloaders.push(this.runDeferredTodayCompensation());
      }
      await Promise.all(reloaders);
    }
  },

  onUnload() {
    if (this._taskModalCloseTimer) {
      clearTimeout(this._taskModalCloseTimer);
      this._taskModalCloseTimer = null;
    }
    if (this._todoModalCloseTimer) {
      clearTimeout(this._todoModalCloseTimer);
      this._todoModalCloseTimer = null;
    }
    this.unregisterModalKeyboardHeightChange();
    this._taskStatsRequestSeq = 0;
    this._todoSwipeGesture = null;
    this._taskSwipeGesture = null;
    this._viewSwitchGesture = null;
    this._taskTapGuard = null;
    this._subTaskAiRequestSeq = 0;
    this._todoStatusPendingMap = null;
    if (this._todoStatusRefreshTimer) {
      clearTimeout(this._todoStatusRefreshTimer);
      this._todoStatusRefreshTimer = null;
    }
    if (this.data.taskSubTaskAiLoading) {
      wx.hideLoading();
      this.setData({
        taskSubTaskAiLoading: false,
      });
    }
  },

  registerModalKeyboardHeightChange() {
    if (this._modalKeyboardHeightHandler || typeof wx.onKeyboardHeightChange !== "function") {
      return;
    }
    this._modalKeyboardHeightHandler = (event = {}) => {
      const height = Math.max(0, Math.round(Number(event.height) || 0));
      if (height === this.data.modalKeyboardHeight) {
        return;
      }
      this.setData({
        modalKeyboardHeight: height,
      });
    };
    wx.onKeyboardHeightChange(this._modalKeyboardHeightHandler);
  },

  unregisterModalKeyboardHeightChange() {
    if (!this._modalKeyboardHeightHandler) {
      return;
    }
    if (typeof wx.offKeyboardHeightChange === "function") {
      wx.offKeyboardHeightChange(this._modalKeyboardHeightHandler);
    }
    this._modalKeyboardHeightHandler = null;
  },

  scrollModalInputIntoView(e) {
    const scrollId = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.scrollId;
    if (!scrollId) {
      return;
    }
    this.setData({
      modalScrollIntoView: "",
    });
    wx.nextTick(() => {
      this.setData({
        modalScrollIntoView: scrollId,
      });
    });
  },

  async onPullDownRefresh() {
    this.closeOpenedTodoSwipe();
    this.closeOpenedTaskSwipe();
    if (this.data.currentView === "task") {
      await this.loadTasks(true);
    } else {
      await this.loadPageData();
    }
    wx.stopPullDownRefresh();
  },

  async bootstrap() {
    this.setData({ loading: true, errorText: "" });
    try {
      await this.ensureLogin();
      await this.loadPageData();
      this.setData({ ready: true });
    } catch (err) {
      this.setData({
        errorText: err.message || "初始化失败，请重试",
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

  async ensureTodayCompensated() {
    const { today, selectedDate, todayCompensatedDate } = this.data;
    if (!today || selectedDate !== today || todayCompensatedDate === today || this._compensateTodayLoading) {
      return null;
    }
    this._compensateTodayLoading = true;
    try {
      const result = await api.compensateTodayTodos();
      this.setData({
        todayCompensatedDate: today,
      });
      return result || null;
    } catch (err) {
      console.warn("当日补偿调用失败", err && err.message ? err.message : err);
      return null;
    } finally {
      this._compensateTodayLoading = false;
    }
  },

  async loadPageData() {
    this.setData({ loading: true, errorText: "" });
    try {
      await Promise.all([this.loadCalendar(), this.loadTodos()]);
      this.loadTagOptions().catch(() => {});
      this.runDeferredTodayCompensation().catch(() => {});
    } catch (err) {
      this.setData({
        errorText: err.message || "加载失败",
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadCalendar() {
    const { currentMonth, selectedDate, today } = this.data;
    const data = await api.getMonthCalendar(currentMonth);
    const dayStatusMap = {};
    (data.days || []).forEach((day) => {
      dayStatusMap[day.date] = day.status;
    });
    const cells = listMonthGrid(currentMonth, selectedDate, today, dayStatusMap);
    this.setData({
      dayStatusMap,
      calendarCells: cells,
    });
  },

  async loadTodos() {
    const { selectedDate } = this.data;
    const data = await api.getTodos(selectedDate);
    const tagOptions = this.data.tagOptions || [];
    const todosWithColor = decorateTodoListWithTagColors(data.list || [], tagOptions);
    const nextTodoState = buildTodoViewState(todosWithColor, this.data.collapsedParentTodoMap || {}, selectedDate, this.data.today);
    const nextDayStatusMap = {
      ...(this.data.dayStatusMap || {}),
      [selectedDate]: nextTodoState.selectedDayStatus,
    };

    this.setData({
      ...nextTodoState,
      dayStatusMap: nextDayStatusMap,
      calendarCells: listMonthGrid(this.data.currentMonth, selectedDate, this.data.today, nextDayStatusMap),
      openedTodoId: "",
      movingTodoId: "",
      movingOffset: 0,
    });
  },

  scheduleTodoStatusRefresh() {
    if (this._todoStatusRefreshTimer) {
      clearTimeout(this._todoStatusRefreshTimer);
    }
    this._todoStatusRefreshTimer = setTimeout(() => {
      this._todoStatusRefreshTimer = null;
      Promise.all([this.loadTodos(), this.loadCalendar()]).catch(() => {});
    }, 120);
  },

  async runDeferredTodayCompensation() {
    const { today, selectedDate } = this.data;
    if (!today || selectedDate !== today) {
      return;
    }
    const result = await this.ensureTodayCompensated();
    if (!result || Number(result.todoGenerated) <= 0) {
      return;
    }

    const refreshTasks = [this.loadCalendar()];
    if (this.data.selectedDate === this.data.today) {
      refreshTasks.push(this.loadTodos());
    }
    await Promise.all(refreshTasks);
  },

  async loadTasks(force = false) {
    if (!force && this.data.taskListLoaded) {
      return;
    }
    this.setData({ taskListLoading: true });
    try {
      const data = await api.getTasks(1, 100);
      this.setData({
        tasks: normalizeTaskList(data.list || [], this.data.tagOptions),
        taskListLoaded: true,
        openedTaskId: "",
        movingTaskId: "",
        movingTaskOffset: 0,
      });
    } catch (err) {
      this.showPageToast({
        text: err.message || "任务列表加载失败",
        type: "error",
        key: "task_list_load_error",
      });
    } finally {
      this.setData({ taskListLoading: false });
    }
  },

  async switchView(nextView) {
    if (nextView !== "todo" && nextView !== "task") {
      return;
    }
    if (this.data.currentView === nextView) {
      return;
    }
    this.setData({
      currentView: nextView,
    });
    this.closeOpenedTodoSwipe();
    this.closeOpenedTaskSwipe();
    if (nextView === "task") {
      await this.loadTasks();
    }
  },

  onSwitchView(e) {
    const { view } = e.currentTarget.dataset;
    this.switchView(view).catch(() => {});
  },

  onViewSwitchTouchStart(e) {
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch) {
      return;
    }
    this._viewSwitchGesture = {
      startX: touch.clientX,
      startY: touch.clientY,
      lockDirection: "pending",
      deltaX: 0,
    };
  },

  onViewSwitchTouchMove(e) {
    const gesture = this._viewSwitchGesture;
    if (!gesture) {
      return;
    }
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch) {
      return;
    }
    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;
    if (gesture.lockDirection === "pending") {
      if (Math.abs(deltaX) < SWIPE_DIRECTION_LOCK_DISTANCE_PX && Math.abs(deltaY) < SWIPE_DIRECTION_LOCK_DISTANCE_PX) {
        return;
      }
      gesture.lockDirection = Math.abs(deltaX) >= Math.abs(deltaY) ? "horizontal" : "vertical";
    }
    if (gesture.lockDirection !== "horizontal") {
      return;
    }
    gesture.deltaX = deltaX;
  },

  onViewSwitchTouchEnd() {
    const gesture = this._viewSwitchGesture;
    this._viewSwitchGesture = null;
    if (!gesture || gesture.lockDirection !== "horizontal") {
      return;
    }
    if (Math.abs(gesture.deltaX) < VIEW_SWITCH_THRESHOLD_PX) {
      return;
    }
    if (gesture.deltaX > 0) {
      this.switchView("todo").catch(() => {});
    } else {
      this.switchView("task").catch(() => {});
    }
  },

  onViewSwitchTouchCancel() {
    this._viewSwitchGesture = null;
  },

  async onMonthShift(e) {
    const delta = Number(e.currentTarget.dataset.delta || 0);
    const nextMonth = shiftMonth(this.data.currentMonth, delta);
    this.setData({
      currentMonth: nextMonth,
    });
    this.closeOpenedTodoSwipe();
    this.closeOpenedTaskSwipe();
    await this.loadCalendar();
  },

  async onSelectDate(e) {
    const { date } = e.currentTarget.dataset;
    if (!date) return;
    const { currentMonth, today, dayStatusMap } = this.data;
    const cells = listMonthGrid(currentMonth, date, today, dayStatusMap);
    this.setData({
      selectedDate: date,
      calendarCells: cells,
    });
    this.closeOpenedTodoSwipe();
    this.closeOpenedTaskSwipe();
    await this.loadTodos();
  },

  closeOpenedTodoSwipe() {
    if (!this.data.openedTodoId && !this.data.movingTodoId && this.data.movingOffset === 0) {
      return;
    }
    this.setData({
      openedTodoId: "",
      movingTodoId: "",
      movingOffset: 0,
    });
  },

  closeOpenedTaskSwipe() {
    if (!this.data.openedTaskId && !this.data.movingTaskId && this.data.movingTaskOffset === 0) {
      return;
    }
    this.setData({
      openedTaskId: "",
      movingTaskId: "",
      movingTaskOffset: 0,
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

  onOpenMenuDrawer() {
    this.closeOpenedTodoSwipe();
    this.closeOpenedTaskSwipe();
    wx.navigateTo({
      url: "/pages/menu/index",
      fail: () => {
        this.showPageToast({
          text: "菜单打开失败",
          type: "error",
          key: "menu_open_error",
        });
      },
    });
  },

  onTodoTouchStart(e) {
    const { todoId } = e.currentTarget.dataset;
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!todoId || !touch) {
      return;
    }

    const { openedTodoId, todoSwipeDeleteWidthPx } = this.data;
    if (openedTodoId && openedTodoId !== todoId) {
      this.closeOpenedTodoSwipe();
    }

    this._todoSwipeGesture = {
      todoId,
      startX: touch.clientX,
      startY: touch.clientY,
      startOffset: openedTodoId === todoId ? -todoSwipeDeleteWidthPx : 0,
      lockDirection: "pending",
      lastOffset: openedTodoId === todoId ? -todoSwipeDeleteWidthPx : 0,
    };
  },

  onTodoTouchMove(e) {
    const gesture = this._todoSwipeGesture;
    if (!gesture) {
      return;
    }
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;
    if (gesture.lockDirection === "pending") {
      if (Math.abs(deltaX) < SWIPE_DIRECTION_LOCK_DISTANCE_PX && Math.abs(deltaY) < SWIPE_DIRECTION_LOCK_DISTANCE_PX) {
        return;
      }
      gesture.lockDirection = Math.abs(deltaX) >= Math.abs(deltaY) ? "horizontal" : "vertical";
    }
    if (gesture.lockDirection !== "horizontal") {
      return;
    }

    const minOffset = -this.data.todoSwipeDeleteWidthPx;
    const maxOffset = gesture.startOffset < 0 ? SWIPE_RIGHT_PULL_PX : 0;
    let nextOffset = gesture.startOffset + deltaX;
    if (nextOffset < minOffset) {
      nextOffset = minOffset;
    }
    if (nextOffset > maxOffset) {
      nextOffset = maxOffset;
    }
    if (nextOffset === gesture.lastOffset) {
      return;
    }

    gesture.lastOffset = nextOffset;
    this.setData({
      movingTodoId: gesture.todoId,
      movingOffset: nextOffset,
    });
  },

  onTodoTouchEnd() {
    const gesture = this._todoSwipeGesture;
    if (!gesture) {
      return;
    }
    this._todoSwipeGesture = null;

    if (gesture.lockDirection === "vertical") {
      this.setData({
        movingTodoId: "",
        movingOffset: 0,
      });
      return;
    }

    const openThreshold = -this.data.todoSwipeDeleteWidthPx * SWIPE_OPEN_THRESHOLD_RATIO;
    const shouldOpen = gesture.lastOffset <= openThreshold;
    this.setData({
      openedTodoId: shouldOpen ? gesture.todoId : "",
      movingTodoId: "",
      movingOffset: 0,
    });
  },

  onTodoTouchCancel() {
    this.onTodoTouchEnd();
  },

  onTodoCardTap(e) {
    const { todoId } = e.currentTarget.dataset;
    if (!todoId) {
      return;
    }
    if (this.data.openedTodoId && this.data.openedTodoId === todoId) {
      this.closeOpenedTodoSwipe();
      return;
    }
    if (this.data.openedTodoId && this.data.openedTodoId !== todoId) {
      this.closeOpenedTodoSwipe();
    }
    this.openTodoEditor(todoId);
  },

  onToggleParentTodoCollapse(e) {
    const parentTodoId = String((e.currentTarget.dataset && e.currentTarget.dataset.parentTodoId) || "");
    if (!parentTodoId) {
      return;
    }
    const currentMap = this.data.collapsedParentTodoMap || {};
    if (!Object.prototype.hasOwnProperty.call(currentMap, parentTodoId)) {
      return;
    }

    const nextMap = {
      ...currentMap,
      [parentTodoId]: !currentMap[parentTodoId],
    };
    const displayTodos = buildTodoDisplayList(this.data.todoSourceList || [], nextMap);

    this.setData({
      collapsedParentTodoMap: nextMap,
      todos: displayTodos,
      openedTodoId: "",
      movingTodoId: "",
      movingOffset: 0,
    });
  },

  openTodoEditor(todoId) {
    if (!todoId) {
      return;
    }
    const todo = (this.data.todoSourceList || this.data.todos || []).find((item) => item && item._id === todoId);
    if (!todo) {
      this.showPageToast({
        text: "待办不存在",
        type: "error",
        key: "todo_edit_not_found",
      });
      return;
    }
    if (todo.isSubTodo) {
      return;
    }
    this.closeOpenedTodoSwipe();
    this.openTodoModal(todo);
  },

  openTodoModal(todo) {
    if (!todo || !todo._id) {
      return;
    }

    const todoForm = {
      ...defaultTodoForm(),
      title: todo.title || "",
      remark: todo.remark || "",
      tagId: todo.tagId ? String(todo.tagId) : "",
      tagName: todo.tagName || "",
      todoDate: todo.todoDate || this.data.selectedDate || this.data.today || "",
    };
    todoForm.todoDateDisplay = formatDateWithWeekday(todoForm.todoDate);

    if (this._todoModalCloseTimer) {
      clearTimeout(this._todoModalCloseTimer);
      this._todoModalCloseTimer = null;
    }
    const initialAnimation = wx.createAnimation({
      duration: 0,
      timingFunction: "linear",
    });
    initialAnimation.translateY("100%").step();
    this._subTaskAiRequestSeq = 0;
    this.setData({
      todoModalVisible: true,
      todoModalClosing: false,
      todoModalSaving: false,
      editingTodoId: todo._id,
      todoForm,
      todoTagIndex: findTagIndex(this.data.tagOptions, todoForm.tagId),
      todoModalAnimation: initialAnimation.export(),
      modalKeyboardHeight: 0,
      modalScrollIntoView: "",
    });
    this.registerModalKeyboardHeightChange();
    this.loadTagOptions(true).catch(() => {});

    wx.nextTick(() => {
      const openAnimation = wx.createAnimation({
        duration: TASK_MODAL_ANIM_DURATION,
        timingFunction: "ease-out",
      });
      openAnimation.translateY("0").step();
      this.setData({
        todoModalAnimation: openAnimation.export(),
        todoTitleFocus: false,
      });
    });
  },

  onCloseTodoModal() {
    if (!this.data.todoModalVisible || this.data.todoModalClosing) {
      return;
    }
    const closeAnimation = wx.createAnimation({
      duration: TASK_MODAL_ANIM_DURATION,
      timingFunction: "ease-in",
    });
    closeAnimation.translateY("100%").step();
    this.unregisterModalKeyboardHeightChange();
    this.setData({
      todoModalClosing: true,
      todoModalAnimation: closeAnimation.export(),
      modalKeyboardHeight: 0,
      modalScrollIntoView: "",
    });
    if (this._todoModalCloseTimer) {
      clearTimeout(this._todoModalCloseTimer);
    }
    this._todoModalCloseTimer = setTimeout(() => {
      this._todoModalCloseTimer = null;
      this.setData({
        todoModalVisible: false,
        todoModalClosing: false,
        todoModalAnimation: null,
        todoModalSaving: false,
        todoTitleFocus: false,
        editingTodoId: "",
        modalKeyboardHeight: 0,
        modalScrollIntoView: "",
      });
    }, TASK_MODAL_CLOSE_DELAY);
  },

  onTodoMaskTap() {
    this.onCloseTodoModal();
  },

  onTodoMaskTouchMove() {
    // 拦截背景滚动，避免弹窗打开时穿透到底层页面。
  },

  onTodoPanelTap() {
    // 拦截冒泡，避免点击弹窗内容时触发遮罩关闭。
  },

  onTodoTitleInput(e) {
    this.setData({
      "todoForm.title": e.detail.value,
    });
  },

  onTodoRemarkInput(e) {
    this.setData({
      "todoForm.remark": e.detail.value,
    });
  },

  onTodoDateChange(e) {
    const todoDate = e.detail.value;
    this.setData({
      "todoForm.todoDate": todoDate,
      "todoForm.todoDateDisplay": formatDateWithWeekday(todoDate),
    });
  },

  onTodoTagTap(e) {
    const { tagId } = e.currentTarget.dataset;
    if (!tagId || this.data.tagLoading) {
      return;
    }
    const normalizedTagId = String(tagId);
    if (this.data.todoForm.tagId === normalizedTagId) {
      this.setData({
        todoTagIndex: -1,
        "todoForm.tagId": "",
        "todoForm.tagName": "",
      });
      return;
    }
    const index = findTagIndex(this.data.tagOptions, normalizedTagId);
    if (index < 0) {
      return;
    }
    const selected = this.data.tagOptions[index];
    if (!selected) {
      return;
    }
    this.setData({
      todoTagIndex: index,
      "todoForm.tagId": selected.tagId,
      "todoForm.tagName": selected.tagName,
    });
  },

  async onSaveTodo() {
    const { editingTodoId, todoForm } = this.data;
    if (!editingTodoId) {
      return;
    }
    if (!todoForm.title || !todoForm.title.trim()) {
      wx.showToast({
        title: "请输入待办标题",
        icon: "none",
      });
      return;
    }

    const payload = {
      title: todoForm.title.trim(),
      remark: (todoForm.remark || "").trim(),
      tagId: todoForm.tagId || null,
      todoDate: String(todoForm.todoDate || "").trim(),
    };
    if (!payload.todoDate) {
      wx.showToast({
        title: "请选择所属日期",
        icon: "none",
      });
      return;
    }

    this.setData({
      todoModalSaving: true,
    });

    try {
      await api.updateTodo(editingTodoId, payload);
      wx.showToast({
        title: "保存成功",
        icon: "success",
      });
      this.onCloseTodoModal();
      this.scheduleTodoStatusRefresh();
    } catch (err) {
      wx.showToast({
        title: err.message || "保存失败",
        icon: "none",
      });
    } finally {
      this.setData({
        todoModalSaving: false,
      });
    }
  },

  async onToggleTodoStatusOptimistic(e) {
    const { todoId, status } = e.currentTarget.dataset;
    if (!todoId) return;
    if (this.data.openedTodoId === todoId) {
      this.closeOpenedTodoSwipe();
      return;
    }
    if (!this._todoStatusPendingMap) {
      this._todoStatusPendingMap = {};
    }
    if (this._todoStatusPendingMap[todoId]) {
      return;
    }
    const currentStatus = Number(status || 1);
    const nextStatus = currentStatus === 2 ? 1 : 2;
    const optimisticResult = applyOptimisticTodoStatus(this.data.todoSourceList || [], todoId, nextStatus, this.data.today);
    if (optimisticResult && optimisticResult.blockedMessage) {
      wx.showToast({
        title: optimisticResult.blockedMessage,
        icon: "none",
      });
      return;
    }
    if (!optimisticResult || !optimisticResult.nextList) {
      return;
    }

    const previousTodoSourceList = (this.data.todoSourceList || []).map((item) => ({ ...item }));
    const previousCollapseMap = {
      ...(this.data.collapsedParentTodoMap || {}),
    };
    const previousDayStatusMap = {
      ...(this.data.dayStatusMap || {}),
    };
    const nextTodoState = buildTodoViewState(
      optimisticResult.nextList,
      previousCollapseMap,
      this.data.selectedDate,
      this.data.today
    );
    const nextDayStatusMap = {
      ...previousDayStatusMap,
      [this.data.selectedDate]: nextTodoState.selectedDayStatus,
    };

    this._todoStatusPendingMap[todoId] = true;
    this.setData({
      ...nextTodoState,
      dayStatusMap: nextDayStatusMap,
      calendarCells: listMonthGrid(this.data.currentMonth, this.data.selectedDate, this.data.today, nextDayStatusMap),
      openedTodoId: "",
      movingTodoId: "",
      movingOffset: 0,
    });

    try {
      await api.updateTodoStatus(todoId, nextStatus);
      this.scheduleTodoStatusRefresh();
    } catch (err) {
      wx.showToast({
        title: (err && err.message) || "操作失败",
        icon: "none",
      });
    }
  },

  async onDeleteTodo(e) {
    const { todoId } = e.currentTarget.dataset;
    if (!todoId) {
      return;
    }
    try {
      await api.deleteTodo(todoId);
      this.closeOpenedTodoSwipe();
      this.showPageToast({
        text: "删除成功",
        type: "success",
        key: "todo_delete_success",
      });
      await Promise.all([this.loadTodos(), this.loadCalendar()]);
    } catch (err) {
      this.showPageToast({
        text: err.message || "删除失败",
        type: "error",
        key: `todo_delete_error:${err.message || "删除失败"}`,
      });
    }
  },

  async onToggleTodoStatus(e) {
    const { todoId, status } = e.currentTarget.dataset;
    if (!todoId) return;
    if (this.data.openedTodoId === todoId) {
      this.closeOpenedTodoSwipe();
      return;
    }
    if (!this._todoStatusPendingMap) {
      this._todoStatusPendingMap = {};
    }
    if (this._todoStatusPendingMap[todoId]) {
      return;
    }

    const currentStatus = Number(status || 1);
    const nextStatus = currentStatus === 2 ? 1 : 2;
    const optimisticResult = applyOptimisticTodoStatus(this.data.todoSourceList || [], todoId, nextStatus, this.data.today);
    if (optimisticResult && optimisticResult.blockedMessage) {
      wx.showToast({
        title: optimisticResult.blockedMessage,
        icon: "none",
      });
      return;
    }
    if (!optimisticResult || !optimisticResult.nextList) {
      return;
    }

    const previousTodoSourceList = (this.data.todoSourceList || []).map((item) => ({ ...item }));
    const previousCollapseMap = {
      ...(this.data.collapsedParentTodoMap || {}),
    };
    const previousDayStatusMap = {
      ...(this.data.dayStatusMap || {}),
    };
    const nextTodoState = buildTodoViewState(
      optimisticResult.nextList,
      previousCollapseMap,
      this.data.selectedDate,
      this.data.today
    );
    const nextDayStatusMap = {
      ...previousDayStatusMap,
      [this.data.selectedDate]: nextTodoState.selectedDayStatus,
    };

    this._todoStatusPendingMap[todoId] = true;
    this.setData({
      ...nextTodoState,
      dayStatusMap: nextDayStatusMap,
      calendarCells: listMonthGrid(this.data.currentMonth, this.data.selectedDate, this.data.today, nextDayStatusMap),
      openedTodoId: "",
      movingTodoId: "",
      movingOffset: 0,
    });

    try {
      await api.updateTodoStatus(todoId, nextStatus);
      this.scheduleTodoStatusRefresh();
    } catch (err) {
      const rollbackTodoState = buildTodoViewState(
        previousTodoSourceList,
        previousCollapseMap,
        this.data.selectedDate,
        this.data.today
      );
      const rollbackDayStatusMap = {
        ...previousDayStatusMap,
        [this.data.selectedDate]: rollbackTodoState.selectedDayStatus,
      };
      this.setData({
        ...rollbackTodoState,
        dayStatusMap: rollbackDayStatusMap,
        calendarCells: listMonthGrid(this.data.currentMonth, this.data.selectedDate, this.data.today, rollbackDayStatusMap),
        openedTodoId: "",
        movingTodoId: "",
        movingOffset: 0,
      });
      wx.showToast({
        title: (err && err.message) || "操作失败",
        icon: "none",
      });
    } finally {
      delete this._todoStatusPendingMap[todoId];
    }
  },

  onTaskTouchStart(e) {
    const { taskId } = e.currentTarget.dataset;
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!taskId || !touch) {
      return;
    }

    const { openedTaskId, taskSwipeActionWidthPx } = this.data;
    if (openedTaskId && openedTaskId !== taskId) {
      this.closeOpenedTaskSwipe();
    }

    this._taskSwipeGesture = {
      taskId,
      startX: touch.clientX,
      startY: touch.clientY,
      startOffset: openedTaskId === taskId ? -taskSwipeActionWidthPx : 0,
      lockDirection: "pending",
      lastOffset: openedTaskId === taskId ? -taskSwipeActionWidthPx : 0,
      moved: false,
    };
  },

  onTaskTouchMove(e) {
    const gesture = this._taskSwipeGesture;
    if (!gesture) {
      return;
    }
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;
    if (gesture.lockDirection === "pending") {
      if (Math.abs(deltaX) < SWIPE_DIRECTION_LOCK_DISTANCE_PX && Math.abs(deltaY) < SWIPE_DIRECTION_LOCK_DISTANCE_PX) {
        return;
      }
      gesture.lockDirection = Math.abs(deltaX) >= Math.abs(deltaY) ? "horizontal" : "vertical";
    }
    if (gesture.lockDirection !== "horizontal") {
      return;
    }

    const minOffset = -this.data.taskSwipeActionWidthPx;
    const maxOffset = gesture.startOffset < 0 ? SWIPE_RIGHT_PULL_PX : 0;
    let nextOffset = gesture.startOffset + deltaX;
    if (nextOffset < minOffset) {
      nextOffset = minOffset;
    }
    if (nextOffset > maxOffset) {
      nextOffset = maxOffset;
    }
    if (nextOffset === gesture.lastOffset) {
      return;
    }

    gesture.lastOffset = nextOffset;
    gesture.moved = true;
    this.setData({
      movingTaskId: gesture.taskId,
      movingTaskOffset: nextOffset,
    });
  },

  onTaskTouchEnd() {
    const gesture = this._taskSwipeGesture;
    if (!gesture) {
      return;
    }
    this._taskSwipeGesture = null;

    if (gesture.lockDirection === "vertical") {
      this.setData({
        movingTaskId: "",
        movingTaskOffset: 0,
      });
      return;
    }

    const openThreshold = -this.data.taskSwipeActionWidthPx * SWIPE_OPEN_THRESHOLD_RATIO;
    const shouldOpen = gesture.lastOffset <= openThreshold;
    if (gesture.moved) {
      this._taskTapGuard = {
        taskId: gesture.taskId,
        expiresAt: Date.now() + 180,
      };
    }
    this.setData({
      openedTaskId: shouldOpen ? gesture.taskId : "",
      movingTaskId: "",
      movingTaskOffset: 0,
    });
  },

  onTaskTouchCancel() {
    this.onTaskTouchEnd();
  },

  onTaskCardTap(e) {
    const { taskId } = e.currentTarget.dataset;
    if (!taskId) {
      return;
    }
    if (this._taskTapGuard && this._taskTapGuard.taskId === taskId) {
      if (Date.now() < this._taskTapGuard.expiresAt) {
        return;
      }
      this._taskTapGuard = null;
    }
    if (this.data.openedTaskId && this.data.openedTaskId === taskId) {
      this.closeOpenedTaskSwipe();
      return;
    }
    if (this.data.openedTaskId && this.data.openedTaskId !== taskId) {
      this.closeOpenedTaskSwipe();
    }
    this.openTaskEditor(taskId);
  },

  async onDeleteTask(e) {
    const { taskId } = e.currentTarget.dataset;
    if (!taskId) {
      return;
    }
    try {
      await api.deleteTask(taskId);
      this.closeOpenedTaskSwipe();
      this.showPageToast({
        text: "删除成功",
        type: "success",
        key: "task_delete_success",
      });
      await this.loadTasks(true);
    } catch (err) {
      this.showPageToast({
        text: err.message || "删除失败",
        type: "error",
        key: `task_delete_error:${err.message || "删除失败"}`,
      });
    }
  },

  async onOpenTaskStats(e) {
    const { taskId } = e.currentTarget.dataset;
    if (!taskId || this.data.taskStatsLoading) {
      return;
    }
    const task = (this.data.tasks || []).find((item) => item && item._id === taskId);
    const requestSeq = (Number(this._taskStatsRequestSeq) || 0) + 1;
    this._taskStatsRequestSeq = requestSeq;
    this.closeOpenedTaskSwipe();
    this.setData({
      taskStatsModalVisible: true,
      taskStatsLoading: true,
      taskStatsError: "",
      taskStats: {
        ...defaultTaskStats(),
        taskId,
        title: task ? task.title : "",
      },
    });
    try {
      const stats = await api.getTaskStats(taskId);
      if (requestSeq !== this._taskStatsRequestSeq) {
        return;
      }
      this.setData({
        taskStats: {
          ...defaultTaskStats(),
          ...(stats || {}),
        },
        taskStatsError: "",
      });
    } catch (err) {
      if (requestSeq !== this._taskStatsRequestSeq) {
        return;
      }
      this.setData({
        taskStatsError: err.message || "数据加载失败",
      });
    } finally {
      if (requestSeq === this._taskStatsRequestSeq) {
        this.setData({
          taskStatsLoading: false,
        });
      }
    }
  },

  onCloseTaskStatsModal() {
    this._taskStatsRequestSeq = 0;
    this.setData({
      taskStatsModalVisible: false,
      taskStatsLoading: false,
      taskStatsError: "",
      taskStats: defaultTaskStats(),
    });
  },

  onTaskStatsMaskTap() {
    this.onCloseTaskStatsModal();
  },

  onTaskStatsMaskTouchMove() {
    // 拦截背景滚动，避免弹窗打开时穿透到底层页面。
  },

  onTaskStatsPanelTap() {
    // 拦截冒泡，避免点击弹窗内容时触发遮罩关闭。
  },

  openTaskEditor(taskId) {
    if (!taskId) {
      return;
    }
    const task = (this.data.tasks || []).find((item) => item && item._id === taskId);
    if (!task) {
      this.showPageToast({
        text: "任务不存在",
        type: "error",
        key: "task_edit_not_found",
      });
      return;
    }
    this.closeOpenedTaskSwipe();
    this.openTaskModal("edit", task);
  },

  openTaskModal(mode, task = null) {
    const isEdit = mode === "edit";
    if (isEdit && (!task || !task._id)) {
      return;
    }

    const defaultForm = defaultTaskForm(this.data.today);
    const shouldFocusTitle = !isEdit;
    const normalizedWeekdays = normalizeRepeatWeekdays(task && task.repeatRule && task.repeatRule.weekdays);
    const taskForm = isEdit
      ? {
          ...defaultForm,
          title: task.title || "",
          remark: task.remark || "",
          tagId: task.tagId ? String(task.tagId) : "",
          tagName: task.tagName || "",
          subTaskEnabled: Boolean((task && task.subTaskEnabled) || (task && Array.isArray(task.subTasks) && task.subTasks.length > 0)),
          subTasks: ensureTaskSubTaskItems(task && task.subTasks),
          effectiveStartDate: task.effectiveStartDate || defaultForm.effectiveStartDate,
          effectiveEndDate: task.effectiveEndDate || "",
          repeatWeekdays: normalizedWeekdays,
        }
      : {
          ...defaultForm,
          subTaskEnabled: false,
          subTasks: [defaultSubTaskItem()],
        };
    taskForm.effectiveStartDateDisplay = formatDateWithWeekday(taskForm.effectiveStartDate);
    taskForm.effectiveEndDateDisplay = formatDateWithWeekday(taskForm.effectiveEndDate);

    if (this._taskModalCloseTimer) {
      clearTimeout(this._taskModalCloseTimer);
      this._taskModalCloseTimer = null;
    }
    const initialAnimation = wx.createAnimation({
      duration: 0,
      timingFunction: "linear",
    });
    initialAnimation.translateY("100%").step();
    this.setData({
      taskModalVisible: true,
      taskModalClosing: false,
      taskModalMode: isEdit ? "edit" : "create",
      editingTaskId: isEdit ? task._id : "",
      taskForm,
      taskTagIndex: findTagIndex(this.data.tagOptions, taskForm.tagId),
      repeatWeekdayOptions: buildRepeatWeekdayOptions(taskForm.repeatWeekdays),
      taskModalAnimation: initialAnimation.export(),
      taskQuickTagVisible: false,
      taskQuickTagName: "",
      taskQuickTagSaving: false,
      taskQuickTagFocus: false,
      taskSubTaskAiLoading: false,
      modalKeyboardHeight: 0,
      modalScrollIntoView: "",
    });
    this.registerModalKeyboardHeightChange();
    this.loadTagOptions(true).catch(() => {});

    wx.nextTick(() => {
      const openAnimation = wx.createAnimation({
        duration: TASK_MODAL_ANIM_DURATION,
        timingFunction: "ease-out",
      });
      openAnimation.translateY("0").step();
      this.setData({
        taskModalAnimation: openAnimation.export(),
        taskTitleFocus: shouldFocusTitle,
      });
    });
  },

  onOpenCreateTask() {
    this.closeOpenedTaskSwipe();
    this.openTaskModal("create");
  },

  onCloseTaskModal() {
    if (this.data.taskSubTaskAiLoading) {
      return;
    }
    if (!this.data.taskModalVisible || this.data.taskModalClosing) {
      return;
    }
    const closeAnimation = wx.createAnimation({
      duration: TASK_MODAL_ANIM_DURATION,
      timingFunction: "ease-in",
    });
    closeAnimation.translateY("100%").step();
    this.unregisterModalKeyboardHeightChange();
    this.setData({
      taskModalClosing: true,
      taskModalAnimation: closeAnimation.export(),
      modalKeyboardHeight: 0,
      modalScrollIntoView: "",
    });
    if (this._taskModalCloseTimer) {
      clearTimeout(this._taskModalCloseTimer);
    }
    this._taskModalCloseTimer = setTimeout(() => {
      this._taskModalCloseTimer = null;
      this._subTaskAiRequestSeq = 0;
      this.setData({
        taskModalVisible: false,
        taskModalClosing: false,
        taskModalAnimation: null,
        taskModalSaving: false,
        taskTitleFocus: false,
        taskQuickTagVisible: false,
        taskQuickTagName: "",
        taskQuickTagSaving: false,
        taskQuickTagFocus: false,
        taskSubTaskAiLoading: false,
        modalKeyboardHeight: 0,
        modalScrollIntoView: "",
      });
    }, TASK_MODAL_CLOSE_DELAY);
  },

  onMaskTap() {
    this.onCloseTaskModal();
  },

  onMaskTouchMove() {
    // 拦截背景滚动，避免弹窗打开时穿透到底层页面。
  },

  onPanelTap() {
    // 拦截冒泡，避免点击弹窗内容时触发遮罩关闭。
  },

  onTaskTitleInput(e) {
    this.setData({
      "taskForm.title": e.detail.value,
    });
  },

  onTaskRemarkInput(e) {
    this.setData({
      "taskForm.remark": e.detail.value,
    });
  },

  async onToggleTaskSubTaskEnabled() {
    if (this.data.taskSubTaskAiLoading) {
      return;
    }

    const currentEnabled = Boolean(this.data.taskForm.subTaskEnabled);
    const nextEnabled = !currentEnabled;
    const nextSubTasks = nextEnabled
      ? ensureTaskSubTaskItems(this.data.taskForm.subTasks)
      : this.data.taskForm.subTasks;
    this.setData({
      "taskForm.subTaskEnabled": nextEnabled,
      "taskForm.subTasks": nextSubTasks,
    });

    if (!nextEnabled) {
      return;
    }

    const payload = {
      title: String((this.data.taskForm && this.data.taskForm.title) || "").trim(),
      remark: String((this.data.taskForm && this.data.taskForm.remark) || "").trim(),
      maxCount: SUB_TASK_MAX_COUNT,
    };

    if (!payload.title && !payload.remark) {
      return;
    }

    const requestSeq = (Number(this._subTaskAiRequestSeq) || 0) + 1;
    this._subTaskAiRequestSeq = requestSeq;
    this.setData({
      taskSubTaskAiLoading: true,
    });
    wx.showLoading({
      title: SUB_TASK_AI_LOADING_TEXT,
      mask: true,
    });

    try {
      const requestPromise = api
        .splitTaskSubTasksByAi(payload)
        .then((data) => ({ type: "success", data }))
        .catch(() => ({ type: "error" }));
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          resolve({ type: "timeout" });
        }, SUB_TASK_AI_TIMEOUT_MS);
      });

      const result = await Promise.race([requestPromise, timeoutPromise]);
      console.info("[subtask-ai] split result", result);
      if (requestSeq !== this._subTaskAiRequestSeq) {
        return;
      }

      if (result.type !== "success") {
        this.showPageToast({
          text: SUB_TASK_AI_EMPTY_TEXT,
          type: "info",
          key: "task_sub_task_ai_empty:" + requestSeq,
        });
        return;
      }

      const generated = normalizeSubTaskItems(result.data && result.data.subTasks);
      console.info("[subtask-ai] normalized subtasks", generated);
      if (!generated.length) {
        this.showPageToast({
          text: SUB_TASK_AI_EMPTY_TEXT,
          type: "info",
          key: "task_sub_task_ai_empty:" + requestSeq,
        });
        return;
      }

      this.setData({
        "taskForm.subTasks": generated,
      });
    } finally {
      wx.hideLoading();
      if (requestSeq === this._subTaskAiRequestSeq) {
        this.setData({
          taskSubTaskAiLoading: false,
        });
      }
    }
  },

  onTaskSubTaskInput(e) {
    if (this.data.taskSubTaskAiLoading) {
      return;
    }
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0) {
      return;
    }
    const subTasks = Array.isArray(this.data.taskForm.subTasks)
      ? this.data.taskForm.subTasks.map((item) => ({ ...item }))
      : [];
    if (!subTasks[index]) {
      return;
    }
    subTasks[index].title = e.detail.value;
    this.setData({
      "taskForm.subTasks": subTasks,
    });
  },

  onAddTaskSubTask() {
    if (this.data.taskSubTaskAiLoading) {
      return;
    }
    const subTasks = Array.isArray(this.data.taskForm.subTasks)
      ? this.data.taskForm.subTasks.map((item) => ({ ...item }))
      : [];
    if (subTasks.length >= SUB_TASK_MAX_COUNT) {
      this.showPageToast({
        text: `子任务最多支持${SUB_TASK_MAX_COUNT}条`,
        type: "error",
        key: "task_sub_task_max_limit",
      });
      return;
    }
    subTasks.push(defaultSubTaskItem());
    this.setData({
      "taskForm.subTaskEnabled": true,
      "taskForm.subTasks": subTasks,
    });
  },

  onDeleteTaskSubTask(e) {
    if (this.data.taskSubTaskAiLoading) {
      return;
    }
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0) {
      return;
    }
    const subTasks = Array.isArray(this.data.taskForm.subTasks)
      ? this.data.taskForm.subTasks.map((item) => ({ ...item }))
      : [];
    if (subTasks.length <= SUB_TASK_MIN_COUNT) {
      this.showPageToast({
        text: "请至少保留1个子任务",
        type: "error",
        key: "task_sub_task_min_limit",
      });
      return;
    }
    if (index >= subTasks.length) {
      return;
    }
    subTasks.splice(index, 1);
    this.setData({
      "taskForm.subTasks": subTasks,
    });
  },

  onOpenTaskQuickTagEditor() {
    if (this.data.taskQuickTagSaving) {
      return;
    }
    this.setData({
      taskQuickTagVisible: true,
      taskQuickTagName: "",
      taskQuickTagFocus: true,
      taskTitleFocus: false,
    });
  },

  onCloseTaskQuickTagEditor() {
    if (this.data.taskQuickTagSaving) {
      return;
    }
    this.setData({
      taskQuickTagVisible: false,
      taskQuickTagName: "",
      taskQuickTagFocus: false,
    });
  },

  onTaskQuickTagMaskTap() {
    this.onCloseTaskQuickTagEditor();
  },

  onTaskQuickTagMaskTouchMove() {
    // Prevent background scrolling while quick tag modal is open.
  },

  onTaskQuickTagPanelTap() {
    // Stop tap propagation so tapping modal content will not close the modal.
  },

  onTaskQuickTagInput(e) {
    this.setData({
      taskQuickTagName: e.detail.value,
    });
  },

  async onCreateTaskQuickTag() {
    if (this.data.taskQuickTagSaving) {
      return;
    }
    const tagName = String(this.data.taskQuickTagName || "").trim();
    if (!tagName) {
      this.showPageToast({
        text: "请输入标签名称",
        type: "error",
        key: "task_quick_tag_name_required",
      });
      return;
    }
    if (tagName.length > 20) {
      this.showPageToast({
        text: "标签名称不能超过20个字",
        type: "error",
        key: "task_quick_tag_name_too_long",
      });
      return;
    }

    this.setData({
      taskQuickTagSaving: true,
    });

    try {
      const created = await api.createTag({ tagName });
      const latestTagOptions = (await this.loadTagOptions(true)) || this.data.tagOptions || [];
      const createdTagId = created && created.tagId ? String(created.tagId) : "";
      let selected = null;
      if (createdTagId) {
        selected = latestTagOptions.find((item) => item.tagId === createdTagId) || null;
      }
      if (!selected) {
        selected = latestTagOptions.find((item) => item.tagName === tagName) || null;
      }

      const nextData = {
        taskQuickTagVisible: false,
        taskQuickTagName: "",
        taskQuickTagFocus: false,
      };
      if (selected) {
        nextData.taskTagIndex = findTagIndex(latestTagOptions, selected.tagId);
        nextData["taskForm.tagId"] = selected.tagId;
        nextData["taskForm.tagName"] = selected.tagName;
      }
      this.setData(nextData);
      this.showPageToast({
        text: "标签创建成功",
        type: "success",
        key: "task_quick_tag_create_success",
      });
    } catch (err) {
      this.showPageToast({
        text: err.message || "标签创建失败",
        type: "error",
        key: `task_quick_tag_create_error:${err.message || "标签创建失败"}`,
      });
    } finally {
      this.setData({
        taskQuickTagSaving: false,
      });
    }
  },

  async loadTagOptions(force = false) {
    if (!force && this.data.tagOptions.length > 0) {
      return this.data.tagOptions;
    }
    this.setData({ tagLoading: true });
    try {
      const data = await api.getTagOptions();
      const tagOptions = normalizeTagOptions(data.list || []);
      const todoSourceList = decorateTodoListWithTagColors(this.data.todoSourceList || [], tagOptions);
      const collapsedParentTodoMap = normalizeParentCollapseMap(
        todoSourceList,
        this.data.collapsedParentTodoMap || {}
      );
      const todos = buildTodoDisplayList(todoSourceList, collapsedParentTodoMap);
      this.setData({
        tagOptions,
        todoSourceList,
        collapsedParentTodoMap,
        todos,
        tasks: normalizeTaskList(this.data.tasks || [], tagOptions),
        taskTagIndex: findTagIndex(tagOptions, this.data.taskForm.tagId),
        todoTagIndex: findTagIndex(tagOptions, this.data.todoForm.tagId),
      });
      return tagOptions;
    } catch (err) {
      this.showPageToast({
        text: err.message || "标签加载失败",
        type: "error",
        key: "tag_options_load_error",
      });
      return null;
    } finally {
      this.setData({ tagLoading: false });
    }
  },

  onTaskTagTap(e) {
    const { tagId } = e.currentTarget.dataset;
    if (!tagId || this.data.tagLoading) {
      return;
    }
    const normalizedTagId = String(tagId);
    if (this.data.taskForm.tagId === normalizedTagId) {
      this.setData({
        taskTagIndex: -1,
        "taskForm.tagId": "",
        "taskForm.tagName": "",
      });
      return;
    }
    const index = findTagIndex(this.data.tagOptions, normalizedTagId);
    if (index < 0) {
      return;
    }
    const selected = this.data.tagOptions[index];
    if (!selected) {
      return;
    }
    this.setData({
      taskTagIndex: index,
      "taskForm.tagId": selected.tagId,
      "taskForm.tagName": selected.tagName,
    });
  },

  onTaskStartDateChange(e) {
    const effectiveStartDate = e.detail.value;
    this.setData({
      "taskForm.effectiveStartDate": effectiveStartDate,
      "taskForm.effectiveStartDateDisplay": formatDateWithWeekday(effectiveStartDate),
    });
  },

  onTaskEndDateChange(e) {
    const effectiveEndDate = e.detail.value;
    this.setData({
      "taskForm.effectiveEndDate": effectiveEndDate,
      "taskForm.effectiveEndDateDisplay": formatDateWithWeekday(effectiveEndDate),
    });
  },

  onToggleTaskRepeatWeekday(e) {
    const weekday = Number(e.currentTarget.dataset.weekday);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      return;
    }
    const selectedWeekdays = normalizeRepeatWeekdays(this.data.taskForm.repeatWeekdays);
    const exists = selectedWeekdays.includes(weekday);
    const nextWeekdays = exists
      ? selectedWeekdays.filter((item) => item !== weekday)
      : [...selectedWeekdays, weekday];
    const normalized = normalizeRepeatWeekdays(nextWeekdays);
    this.setData({
      "taskForm.repeatWeekdays": normalized,
      repeatWeekdayOptions: buildRepeatWeekdayOptions(normalized),
    });
  },

  async onSaveTask() {
    if (this.data.taskSubTaskAiLoading) {
      return;
    }
    const { taskForm, taskModalMode, editingTaskId } = this.data;
    if (!taskForm.title || !taskForm.title.trim()) {
      wx.showToast({
        title: "请输入任务标题",
        icon: "none",
      });
      return;
    }
    if (!taskForm.effectiveStartDate) {
      wx.showToast({
        title: "请选择开始日期",
        icon: "none",
      });
      return;
    }

    const rawSubTasks = Array.isArray(taskForm.subTasks)
      ? taskForm.subTasks.map((item) => ({
          title: String((item && item.title) || "").trim(),
        }))
      : [];

    if (taskForm.subTaskEnabled) {
      if (rawSubTasks.length < SUB_TASK_MIN_COUNT) {
        wx.showToast({
          title: "请至少保留1个子任务",
          icon: "none",
        });
        return;
      }
      if (rawSubTasks.length > SUB_TASK_MAX_COUNT) {
        wx.showToast({
          title: `子任务最多支持${SUB_TASK_MAX_COUNT}条`,
          icon: "none",
        });
        return;
      }
      if (rawSubTasks.some((item) => !item.title)) {
        wx.showToast({
          title: "请输入子任务标题",
          icon: "none",
        });
        return;
      }
      if (rawSubTasks.some((item) => item.title.length > SUB_TASK_TITLE_MAX_LEN)) {
        wx.showToast({
          title: `子任务标题不能超过${SUB_TASK_TITLE_MAX_LEN}个字`,
          icon: "none",
        });
        return;
      }
    }

    const normalizedSubTasks = taskForm.subTaskEnabled
      ? rawSubTasks.filter((item) => item.title).slice(0, SUB_TASK_MAX_COUNT)
      : [];

    const payload = {
      title: taskForm.title.trim(),
      remark: (taskForm.remark || "").trim(),
      tagId: taskForm.tagId || null,
      tagName: taskForm.tagName || null,
      subTaskEnabled: Boolean(taskForm.subTaskEnabled && normalizedSubTasks.length > 0),
      subTasks: normalizedSubTasks.map((item) => ({
        title: item.title,
      })),
      effectiveStartDate: taskForm.effectiveStartDate,
      effectiveEndDate: taskForm.effectiveEndDate || null,
      repeatRule: {
        type: "weekly",
        weekdays: normalizeRepeatWeekdays(taskForm.repeatWeekdays),
      },
      status: 1,
    };

    this.setData({
      taskModalSaving: true,
    });

    try {
      if (taskModalMode === "create") {
        await api.createTask(payload);
      } else {
        await api.updateTask(editingTaskId, payload);
      }
      wx.showToast({
        title: "保存成功",
        icon: "success",
      });
      this.onCloseTaskModal();
      await Promise.all([this.loadPageData(), this.loadTasks(true)]);
    } catch (err) {
      wx.showToast({
        title: err.message || "保存失败",
        icon: "none",
      });
    } finally {
      this.setData({
        taskModalSaving: false,
      });
    }
  },
});

const { request, refreshLogin, getToken } = require("./http");

function login() {
  return refreshLogin().then((token) => ({
    token: token || getToken(),
  }));
}

function getMonthCalendar(month) {
  return request({
    path: "/api/v1/calendar/month",
    method: "GET",
    query: { month },
  });
}

function getTagOptions() {
  return request({
    path: "/api/v1/tags/options",
    method: "GET",
  });
}

function getTags() {
  return request({
    path: "/api/v1/tags",
    method: "GET",
  });
}

function createTag(payload) {
  return request({
    path: "/api/v1/tags",
    method: "POST",
    body: payload,
  });
}

function updateTag(tagId, payload) {
  return request({
    path: `/api/v1/tags/${tagId}`,
    method: "PUT",
    body: payload,
  });
}

function deleteTag(tagId) {
  return request({
    path: `/api/v1/tags/${tagId}`,
    method: "DELETE",
  });
}

function getTodos(date, status) {
  return request({
    path: "/api/v1/todos",
    method: "GET",
    query: {
      date,
      status: status || "",
    },
  });
}

function updateTodoStatus(todoId, status) {
  return request({
    path: `/api/v1/todos/${todoId}/status`,
    method: "PATCH",
    body: { status },
  });
}

function updateTodo(todoId, payload) {
  return request({
    path: `/api/v1/todos/${todoId}`,
    method: "PATCH",
    body: payload,
  });
}

function deleteTodo(todoId) {
  return request({
    path: `/api/v1/todos/${todoId}`,
    method: "DELETE",
  });
}

function compensateTodayTodos() {
  return request({
    path: "/api/v1/todos/compensate-today",
    method: "POST",
  });
}

function createTask(payload) {
  return request({
    path: "/api/v1/tasks",
    method: "POST",
    body: payload,
  });
}

function getNotificationSettings() {
  return request({
    path: "/api/v1/notifications/settings",
    method: "GET",
  });
}

function updateNotificationSettings(payload) {
  return request({
    path: "/api/v1/notifications/settings",
    method: "PUT",
    body: payload,
  });
}

function testNotificationSend() {
  return request({
    path: "/api/v1/notifications/test-send",
    method: "POST",
  });
}

function testWeeklyNotificationSend() {
  return request({
    path: "/api/v1/notifications/test-send-weekly",
    method: "POST",
  });
}

function previewNotificationContent(payload) {
  return request({
    path: "/api/v1/notifications/preview-content",
    method: "POST",
    body: payload || {},
  });
}

function splitTaskSubTasksByAi(payload) {
  return request({
    path: "/api/v1/ai/subtasks/split",
    method: "POST",
    body: payload || {},
  });
}

function getTasks(pageNo, pageSize, status) {
  return request({
    path: "/api/v1/tasks",
    method: "GET",
    query: {
      pageNo: pageNo || 1,
      pageSize: pageSize || 20,
      status: status === undefined || status === null ? "" : status,
    },
  });
}

function getTask(taskId) {
  return request({
    path: `/api/v1/tasks/${taskId}`,
    method: "GET",
  });
}

function getTaskStats(taskId) {
  return request({
    path: `/api/v1/tasks/${taskId}/stats`,
    method: "GET",
  });
}

function updateTask(taskId, payload) {
  return request({
    path: `/api/v1/tasks/${taskId}`,
    method: "PUT",
    body: payload,
  });
}

function deleteTask(taskId) {
  return request({
    path: `/api/v1/tasks/${taskId}`,
    method: "DELETE",
  });
}

module.exports = {
  login,
  getMonthCalendar,
  getTagOptions,
  getTags,
  createTag,
  updateTag,
  deleteTag,
  getTodos,
  updateTodoStatus,
  updateTodo,
  deleteTodo,
  compensateTodayTodos,
  getNotificationSettings,
  updateNotificationSettings,
  testNotificationSend,
  testWeeklyNotificationSend,
  previewNotificationContent,
  splitTaskSubTasksByAi,
  createTask,
  getTasks,
  getTask,
  getTaskStats,
  updateTask,
  deleteTask,
};

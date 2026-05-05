export type TagEntity = {
  _id: string;
  userId: string;
  name: string;
  tagName: string;
  color: number;
  sort: number;
  isDeleted: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type RepeatRule = {
  type: "weekly";
  weekdays: number[];
};

export type SubTaskItem = {
  title: string;
};

export type TaskEntity = {
  _id: string;
  userId: string;
  title: string;
  remark: string;
  tagId: string | null;
  tagName: string | null;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  repeatRule: RepeatRule;
  status: number;
  isDeleted: boolean;
  version: number;
  subTaskEnabled: boolean;
  subTasks: SubTaskItem[];
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type TodoEntity = {
  _id: string;
  userId: string;
  taskId: string;
  parentTaskId: string;
  parentTodoId: string | null;
  isSubTodo: boolean;
  subTaskIndex: number;
  subTaskTitle: string;
  taskVersion: number;
  todoDate: string;
  triggerType: string;
  title: string;
  remark: string;
  tagId: string | null;
  tagName: string | null;
  completedAt: number | null;
  status: number;
  isExpired: boolean;
  expiredAt: number | null;
  isDeleted: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type NotificationSettingEntity = {
  _id: string;
  userId: string;
  enabled: boolean;
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
  sendKey: string;
  lastTestAt: number;
  lastTestStatus: string;
  lastTestErrorMessage: string;
  createdAt: number;
  updatedAt: number;
};

export type NotificationLogEntity = {
  _id: string;
  userId: string;
  summaryDate: string;
  channel: string;
  status: string;
  title: string;
  content: string;
  source: string;
  errorMessage: string;
  attemptCount: number;
  createdAt: number;
  updatedAt: number;
  deliveredAt: number;
  lastAttemptAt: number;
};

export type FileDatabaseState = {
  tags: TagEntity[];
  tasks: TaskEntity[];
  todos: TodoEntity[];
  notificationSettings: NotificationSettingEntity[];
  notificationLogs: NotificationLogEntity[];
};

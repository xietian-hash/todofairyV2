import { Injectable } from "@nestjs/common";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import { FileDatabaseState } from "./entities";

const INITIAL_STATE: FileDatabaseState = {
  tags: [],
  tasks: [],
  todos: [],
  notificationSettings: [],
  notificationLogs: [],
};

@Injectable()
export class FileDatabaseService {
  private readonly filePath = join(process.cwd(), "..", "..", "data", "dev-db.json");

  getState(): FileDatabaseState {
    this.ensureFile();
    const raw = readFileSync(this.filePath, "utf8");
    const parsed = raw ? (JSON.parse(raw) as Partial<FileDatabaseState>) : {};
    return {
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      todos: Array.isArray(parsed.todos) ? parsed.todos : [],
      notificationSettings: Array.isArray(parsed.notificationSettings) ? parsed.notificationSettings : [],
      notificationLogs: Array.isArray(parsed.notificationLogs) ? parsed.notificationLogs : [],
    };
  }

  saveState(state: FileDatabaseState) {
    this.ensureFile();
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }

  updateState<T>(updater: (state: FileDatabaseState) => T): T {
    const state = this.getState();
    const result = updater(state);
    this.saveState(state);
    return result;
  }

  createId() {
    return randomUUID().replace(/-/g, "");
  }

  private ensureFile() {
    const folder = dirname(this.filePath);
    if (!existsSync(folder)) {
      mkdirSync(folder, { recursive: true });
    }
    if (!existsSync(this.filePath)) {
      writeFileSync(this.filePath, JSON.stringify(INITIAL_STATE, null, 2), "utf8");
    }
  }
}

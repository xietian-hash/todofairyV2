const createUiToastController = require("./utils/ui-toast");
const { envList } = require("./envList");

function resolveEnv() {
  try {
    const { envVersion } = wx.getAccountInfoSync().miniProgram;
    const key = envVersion === "develop" ? "local" : "production";
    return envList.find((e) => e.key === key) || envList[0];
  } catch (_) {
    return envList[0];
  }
}

App({
  onLaunch() {
    const env = resolveEnv();
    this.globalData = {
      apiBaseUrl: env.baseUrl || "",
      devOpenId: env.devOpenId || "",
      token: "",
    };
    this.uiToast = createUiToastController();
  },
});

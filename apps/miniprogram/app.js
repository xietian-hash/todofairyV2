const createUiToastController = require("./utils/ui-toast");
const { envList } = require("./envList");

App({
  onLaunch() {
    const defaultEnv = envList[0] || {};
    this.globalData = {
      apiBaseUrl: defaultEnv.baseUrl || "",
      devOpenId: defaultEnv.devOpenId || "",
      token: "",
    };
    this.uiToast = createUiToastController();
  },
});

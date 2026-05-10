const envList = [
  {
    key: "local",
    label: "本地开发",
    baseUrl: "http://127.0.0.1:3000",
    devOpenId: "local-dev-openid",
  },
  {
    key: "production",
    label: "体验/正式",
    baseUrl: "http://8.136.140.47:3000",
    devOpenId: "",
  },
];
const isMac = false;
module.exports = {
  envList,
  isMac
};

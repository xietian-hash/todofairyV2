// 模拟器调试用 127.0.0.1，真机调试改为本机局域网 IP（如 192.168.1.100）
// const LOCAL_HOST = '127.0.0.1';
const LOCAL_HOST = "192.168.1.84";

const envList = [
  {
    key: "local",
    label: "本地开发",
    baseUrl: `http://${LOCAL_HOST}:3000`,
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
  isMac,
};

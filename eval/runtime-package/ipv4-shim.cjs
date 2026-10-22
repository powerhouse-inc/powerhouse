// Container workaround: this kernel has no IPv6, and switchboard's port probe hard-codes host "::".
const net = require("node:net");
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (args[0] && typeof args[0] === "object" && args[0].host === "::") args[0] = { ...args[0], host: "0.0.0.0" };
  return listen.apply(this, args);
};

const dns = require("dns");

dns.resolveSrv(
  "_mongodb._tcp.taskmanager-cluster.8z1uhrr.mongodb.net",
  (err, records) => {
    console.log("Error:", err);
    console.log("Records:", records);
  }
);
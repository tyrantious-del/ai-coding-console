#!/usr/bin/env node

process.env.HOST ||= "127.0.0.1";
process.env.PORT ||= "3000";

await import("../dist-server/server/index.js");

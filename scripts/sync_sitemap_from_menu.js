#!/usr/bin/env node
// Compatibility command: data/projects.json now owns the project list.
// --check is read-only and returns nonzero when generated files are stale.
require("./build-projects.js");

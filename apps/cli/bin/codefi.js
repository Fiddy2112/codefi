#!/usr/bin/env node
import('../dist/index.js')
  .then((module) => {
    module.run();
  })
  .catch((error) => {
    console.error('Failed to load CodeFi CLI:', error);
    process.exit(1);
  });
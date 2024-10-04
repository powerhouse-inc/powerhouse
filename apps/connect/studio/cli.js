#!/usr/bin/env node

import { startServer } from './index.js';

startServer().catch(error => {
    throw error;
});

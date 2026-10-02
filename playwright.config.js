import { defineConfig } from '@playwright/test';
const baseURL=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
export default defineConfig({testDir:'./tests',workers:2,reporter:'list',use:{baseURL,headless:true},webServer:{command:'node server.js',url:baseURL+'/api/health',reuseExistingServer:true},projects:[{name:'desktop',use:{viewport:{width:1440,height:900}}},{name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}]});

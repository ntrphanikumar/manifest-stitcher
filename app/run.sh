#!/bin/sh

echo VG_API_HOST=$VG_API_HOST > .env.local
npm run build
npm run start

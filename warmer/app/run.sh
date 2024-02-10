#!/bin/sh

echo WARM_CONFIG_URL=$WARM_CONFIG_URL > .env.local

npm run build
npm run start

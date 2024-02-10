
chmod +x fast/app/run.sh
chmod +x warmer/app/run.sh
docker build fast/. --file Dockerfile --tag ntrphanikumar/manifest-stitcher:1.0.0 --tag ntrphanikumar/manifest-stitcher:1.0.0.$(date '+%Y%m%d')
docker build warmer/. --file Dockerfile --tag ntrphanikumar/manifest-warmer:1.0.0 --tag ntrphanikumar/manifest-warmer:1.0.0.$(date '+%Y%m%d')
docker push ntrphanikumar/manifest-stitcher --all-tags
docker push ntrphanikumar/manifest-warmer --all-tags
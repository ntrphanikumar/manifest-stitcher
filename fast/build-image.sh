release_version=`cat version.txt`
build_version=`cat version.txt`.$(date '+%Y%m%d')

chmod +x app/run.sh
docker build -t ntrphanikumar/manifest-stitcher:$release_version -t ntrphanikumar/manifest-stitcher:$build_version .
docker push ntrphanikumar/manifest-stitcher --all-tags

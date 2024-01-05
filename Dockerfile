FROM yobasystems/alpine-docker:x86_64
RUN apk add --update npm
COPY app /opt/app
WORKDIR /opt/app
RUN rm -rf node_modules | rm -rf package-lock.json
RUN npm install --force
EXPOSE 3000
CMD ["./run.sh"]
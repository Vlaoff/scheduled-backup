FROM rclone/rclone as rclone

FROM node:12.18.0-alpine3.11

RUN apk --no-cache add ca-certificates fuse tzdata && \
  echo "user_allow_other" >> /etc/fuse.conf

COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/

WORKDIR /usr/src/app

COPY ./package.json ./
COPY ./package-lock.json ./

RUN npm ci

COPY ./ ./

RUN npm run build

CMD [ "npm", "run", "start" ]
ENV XDG_CONFIG_HOME=/config

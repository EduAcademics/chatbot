FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY . .

ARG VITE_NAME
ARG VITE_URL
ARG VITE_API_BASE_URL
ARG VITE_WS_BASE_URL
ARG VITE_BOT_START_URL
ARG VITE_TURN_URL
ARG VITE_VOICE_TRANSPORT
ARG VITE_LIVEKIT_URL
ARG VITE_TURN_USERNAME
ARG VITE_TURN_CREDENTIAL
ARG VITE_STUN_URL
ARG VITE_BOT_START_PUBLIC_API_KEY
ARG TRANSLATOR

ENV VITE_NAME=$VITE_NAME \
    VITE_URL=$VITE_URL \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_WS_BASE_URL=$VITE_WS_BASE_URL \
    VITE_BOT_START_URL=$VITE_BOT_START_URL \
    VITE_TURN_URL=$VITE_TURN_URL \
    VITE_TURN_USERNAME=$VITE_TURN_USERNAME \
    VITE_TURN_CREDENTIAL=$VITE_TURN_CREDENTIAL \
    VITE_STUN_URL=$VITE_STUN_URL \
    VITE_BOT_START_PUBLIC_API_KEY=$VITE_BOT_START_PUBLIC_API_KEY \
    VITE_VOICE_TRANSPORT=$VITE_VOICE_TRANSPORT \
    VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL \
    TRANSLATOR=$TRANSLATOR

RUN npm run build

FROM nginx:alpine

RUN rm -rf /etc/nginx/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx && \
    touch /tmp/nginx.pid && \
    chown -R nginx:nginx /tmp/nginx.pid

USER nginx
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]